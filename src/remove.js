import { deepmerge } from "./dependencies";
import { getUserId } from "./helpers";
import { getHooks } from "./hook";
import { fetch } from "./fetch";
import update from "./update";
import { isEmpty, isFunc, isObj, isSelector } from "./util";

/* `beforeRemove` hook:
 *   (selector, { userId }) => selector
 *   (selector, { userId }) => (doc) => shouldKeepBool || updateModifier
 * `afterRemove` hook: (doc, { userId }) => void */
export default function remove(Coll, selector, callback) {
  const {
    before: beforeHooks,
    validate: validateHook,
    after: afterHooks,
  } = getHooks(Coll, "remove");

  const _beforeHooks = [...beforeHooks, validateHook];

  if (isEmpty(_beforeHooks) && isEmpty(afterHooks))
    return Coll.remove(selector, callback);

  const userId = getUserId();
  const plannedUpdates = {};

  const modifiedSelector = _beforeHooks.reduce((_selector, hook) => {
    /* Do not execute further hooks if already cancelled */
    if (!isFunc(hook) || !isObj(_selector)) return _selector;

    /* `acc` is an object. */
    const res = hook(_selector, { userId });

    if (!isFunc(res)) return res;

    /* If hook return value is a function, it is considered a "shouldKeep" predicate function.
     * Each document to be removed is passed to this predicate;
     * if truthy, exclude the document from the removal selector.
     * Furthermore, if result is an object. it is treated as an update modifier.
     * The documents that get such a modifier won't be removed, but will be updated with it. */
    const shouldKeepPred = res;
    let idsToKeep = [];

    Coll.find(_selector, { transform: null }).forEach((doc) => {
      const _id = doc._id;
      const shouldKeep = shouldKeepPred(doc);

      if (shouldKeep) idsToKeep = [...idsToKeep, _id];

      /* This document has a planned update */
      if (isObj(shouldKeep))
        plannedUpdates[_id] = deepmerge(plannedUpdates[_id] || {}, shouldKeep);
    });

    /* Exclude kept document ids from the removal selector */
    return deepmerge(_selector, { _id: { $nin: idsToKeep } });
  }, selector);

  let result;

  /* Execute planned updates */
  Object.entries(plannedUpdates).forEach(([_id, modifier]) =>
    update(Coll, { _id }, modifier)
  );

  /* Abort removal if selector is not an object */
  if (!isSelector(modifiedSelector)) return result;

  /* If not on server, remove documents. */
  if (!Meteor.isServer) return Coll.remove(modifiedSelector, callback);

  /* SERVER ONY */

  /* Fetch documents only if some after hooks are defined.
   * Since after hooks are run only on server, fetched only on server. */
  let removedDocs = isEmpty(afterHooks)
    ? []
    : fetch(Coll, modifiedSelector, { transform: null });

  /* Actually remove targeted documents */
  result = Coll.remove(modifiedSelector, callback);

  /* Apply after hooks on removed documents.
   * Defer each execution to unblock the main events processing loop. */
  removedDocs.forEach((doc) =>
    afterHooks.forEach((hook) => {
      if (!isFunc(hook)) return;
      Meteor.defer(() => hook(doc, { userId }));
    })
  );

  return result;
}
