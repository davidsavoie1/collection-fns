import { detailedDiff, EJSON, LocalCollection } from "./dependencies";
import { fetch } from "./fetch";
import { getUserId } from "./helpers";
import { getHooks } from "./hook";
import { get2ndLevelFields, isObj, isEmpty, isFunc, isModifier } from "./util";

/* `beforeUpdate` hook:
 *   (modifier, { fields, userId }) => modifier
 *   (modifier, { fields, userId }) => ({ before, after, diff, fields, userId }) => modifier)
 * `afterUpdate` hook:
 *   ({ before, after, diff, fields, userId }) => void */
export default function update(
  Coll,
  selector,
  modifier,
  options = {},
  callback
) {
  const {
    before: beforeHooks,
    validate: validateHook,
    after: afterHooks,
  } = getHooks(Coll, "update");

  const _beforeHooks = [...beforeHooks, validateHook];

  /* If no hooks, perform default update */
  if (isEmpty(_beforeHooks) && isEmpty(afterHooks))
    return Coll.update(selector, modifier, options, callback);

  const userId = getUserId();

  function callHookCallback(before, modifier, hookCallback) {
    if (!isModifier(modifier)) return modifier;

    const after = simulateUpdate(before, modifier);
    const detailedUpdate = detailUpdate(before, after);
    const cleaned = cleanModifier(hookCallback({ ...detailedUpdate, userId }));
    return cleaned === undefined ? modifier : cleaned;
  }

  const modifiedModifier = _beforeHooks.reduce((_modifier, hook) => {
    if (!isFunc(hook)) return _modifier;

    if (isModifier(_modifier)) {
      const modOrFn = hook(_modifier, {
        fields: get2ndLevelFields(modifier),
        userId,
      });

      if (isFunc(modOrFn)) {
        /* Hook returned a function that expects update details.
         * Reduced modifier is now a function that expects the doc prior to update. */
        return (before) => callHookCallback(before, _modifier, modOrFn);
      }

      const cleaned = cleanModifier(modOrFn);
      return cleaned === undefined ? _modifier : cleaned;
    }

    /* Current modifier is itself a function, so all subsequent ones
     * must return a function too. */
    if (isFunc(_modifier))
      return (before) => {
        const currModifier = _modifier(before);
        const result = hook(_modifier, {
          fields: get2ndLevelFields(_modifier),
          userId,
        });

        if (isFunc(result)) {
          /* Hook returned a function that expects update details */
          return callHookCallback(before, currModifier, result);
        }

        const cleaned = cleanModifier(result);
        return cleaned === undefined ? currModifier : cleaned;
      };

    return _modifier;
  }, modifier);

  /* Fetch targeted docs only once for all after hooks (if there are some)
   * before actual update to save their previous state. */
  let targetedDocs;
  if (isFunc(modifiedModifier) || !isEmpty(afterHooks)) {
    targetedDocs = fetch(Coll, selector, {
      limit: options.multi ? undefined : 1,
      transform: null,
    });
  }

  function commitUpdate(update) {
    if (isModifier(modifiedModifier)) {
      return update(selector, modifiedModifier, options, callback);
    }

    /* If modifier is a function, it requires the current document
     * to calculate modified modifier. Each targeted document will get updated
     * individually since they could each have a distinct one. */
    if (isFunc(modifiedModifier)) {
      /* First calculate all modifiers, since any could throw an error,
       * which should prevent entire update. */
      const orderedModifiers = targetedDocs.map((doc) => modifiedModifier(doc));

      return targetedDocs.reduce((updatedCount, doc, idx) => {
        const customModifier = orderedModifiers[idx];

        /* Abort the update if not a modifier */
        if (!isModifier(customModifier)) return updatedCount;

        return updatedCount + update(doc._id, customModifier);
      }, 0);
    }

    return 0;
  }

  /* Actually update targeted documents, either globally
   * if modifier is an object or on a per-document basis if
   * it is a function. */
  const nbUpdated = commitUpdate(Coll.update.bind(Coll));

  if (!Meteor.isServer || !nbUpdated || isEmpty(afterHooks)) {
    return nbUpdated;
  }

  /* SERVER ONLY */
  const modifiedDocsById = {};

  /* Fetch newly updated docs to derive a list of detailed update values
   * that will be passed to each `afterUpdate` hooks. */
  const targetedDocsIds = targetedDocs.map((doc) => doc._id);

  fetch(Coll, { _id: { $in: targetedDocsIds } }, { transform: null }).forEach(
    (doc) => (modifiedDocsById[doc._id] = doc)
  );

  /* Execute all afterUpdate hooks on each updated document with details.
   * Defer each execution to unblock the main events processing loop. */
  targetedDocs.forEach((before) => {
    const after = modifiedDocsById[before._id];
    const detailedUpdate = detailUpdate(before, after);

    afterHooks.forEach((hook) => {
      if (!isFunc(hook)) return;
      Meteor.defer(() => hook({ ...detailedUpdate, userId }));
    });
  });

  return nbUpdated;
}

/* HELPERS */

/* Remove empty modifier operators (starting with '$') that would cause an error. */
function cleanModifier(modifier) {
  if (!isObj(modifier)) return modifier;
  return Object.fromEntries(
    Object.entries(modifier).filter(([key, val]) => {
      if (key.startsWith("$") && !isModifier(val)) return false;
      return true;
    })
  );
}

/* Take a document object and apply a mongo style modifier
 * and return the modified document.
 * https://forums.meteor.com/t/solved-how-to-apply-a-mongo-modifier-to-a-local-object/19090/3 */
function simulateUpdate(doc, modifier) {
  const modified = EJSON.clone(doc);
  LocalCollection._modify(modified, modifier); // Mutates the document, returns undefined
  return modified;
}

/* Take before and after documents, calculate their differences
 * and return a detailed explanation of the update. */
function detailUpdate(before, after) {
  const diff = detailedDiff(before, after);
  const fields = get2ndLevelFields(diff);
  return { before, after, diff, fields };
}
