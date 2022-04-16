import { getUserId } from "./helpers";
import { getHooks } from "./hook";
import { isEmpty, isFunc, isObj } from "./util";

/* `beforeInsert`: (doc, { userId }) => doc
 * `validateInsert`: Same as `beforeInsert`
 * `afterInsert`:
 *   (_id, { userId }) => void
 *   (_id, { userId }) => (doc, { userId }) => void */
export default function insert(Coll, doc, callback) {
  const {
    before: beforeHooks,
    validate: validateHook,
    after: afterHooks,
  } = getHooks(Coll, "insert");

  const _beforeHooks = [...beforeHooks, validateHook];

  if (isEmpty(_beforeHooks) && isEmpty(afterHooks))
    return Coll.insert(doc, callback);

  const userId = getUserId();

  /* Execute before hooks as long as their return value is still an object. */
  const modifiedDoc = _beforeHooks.reduce((_doc, hook) => {
    if (!isFunc(hook) || !isObj(_doc)) return _doc;
    return hook(_doc, { userId });
  }, doc);

  /* If modified doc is not an object anymore, cancel insertion. */
  if (!isObj(modifiedDoc)) return undefined;

  const _id = Coll.insert(modifiedDoc, callback);

  if (!Meteor.isServer) return _id;

  /* SERVER ONLY */

  /* Fetch inserted doc only once for all after hooks, and only if at least one needs it.
   * Defer each execution to unblock the main events processing loop. */
  let insertedDoc;
  afterHooks.forEach((hook) => {
    if (!isFunc(hook)) return;
    Meteor.defer(() => {
      const maybeFunc = hook(_id, { userId });
      if (isFunc(maybeFunc)) {
        insertedDoc = insertedDoc || Coll.findOne(_id, { transform: null });
        maybeFunc(insertedDoc, { userId });
      }
    });
  });
  return _id;
}
