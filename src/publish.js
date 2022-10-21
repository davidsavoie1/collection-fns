import { getJoins } from "./join";
import { dispatchFields, normalizeFields } from "./helpers";
import { difference, isEmpty, union } from "./util";

/* If fields of same collection documents are different on joins, they seem to be merged.
 * À ÉCRIRE : subSelectors, fields ({ _id: 0 }), joins */
export default function publish(
  ctx,
  {
    Coll,
    selector = {},
    fields,
    joins: overridingJoins = {},
    subSelectors = {},
    ...options
  },
  config = {}
) {
  const { debug = false } = config;

  function log(...args) {
    /* eslint-disable-next-line no-console */
    if (Meteor.isDevelopment && debug) console.log(...args);
  }

  const collName = Coll._name;
  const joins = { ...getJoins(Coll), ...overridingJoins };

  /* If fields include a defined falsy value for `_id`, documents won't be published,
   * but joins will still be managed. */
  const noPublish = fields && fields._id !== undefined && !fields._id;

  const { _: ownFields, ...joinFields } = dispatchFields(fields, joins);

  /* Add extra properties to joins, keeping only those that are defined
   * in the fields. Selector updates are associated here. */
  const joinsList = Object.entries(joins)
    .filter(([key]) => joinFields[key])
    .map(([key, join]) => ({
      ...join,
      _addedSelector: subSelectors[key],
      _fieldsToFetch: joinFields[key],
      _key: key,
      _toSelectors: joinToSelectorUpdaters(join),
    }));

  let joinSelectors = {}, // Selector by join name
    joinObservers = {}, // List of observers by join name. Last one stopped after new one appended.
    initiated = false; // To skip initial `added` phase

  function updateJoins(changeType, _id, fields) {
    joinsList.forEach((join) => {
      /* `_toSelectors` will return for each change type a new selector
       * and a potential function to run to remove now unused documents.
       * List state to publish is kept in `joinToSelectorUpdaters` closure. */
      const toSelector = join._toSelectors[changeType];
      const [subSelector, removeItems] = toSelector(_id, fields);

      removeItems && removeItems(ctx);

      joinSelectors[join._key] = subSelector;

      /* Do not republish if selector hasn't changed. */
      const noChange = EJSON.equals(subSelector, joinSelectors[join._key]);
      if (!subSelector || noChange) return;

      /* Wait before publication has been fully initiated before publishing a join. */
      if (initiated) publishJoin(join);
    });
  }

  /* First publish new join, then stop previous observer so that documents are overlapped. */
  function publishJoin(join) {
    const { joins: subJoins = [], _addedSelector, _fieldsToFetch, _key } = join;

    const joinSelector = joinSelectors[_key];
    if (!joinSelector) return;

    const prevObservers = joinObservers[_key] || [];
    const lastObserver = prevObservers[prevObservers.length - 1];

    /* Recursively call `publish` for the join. */
    const newObserver = publish(
      ctx,
      {
        Coll: join.Coll,
        selector: _addedSelector
          ? { $and: [joinSelector, _addedSelector] }
          : joinSelector,
        ...join.options,
        fields: _fieldsToFetch,
        joins: subJoins,
      },
      config
    );

    /* Append the new observer to the end of observers list for join key. */
    joinObservers[_key] = [...prevObservers, newObserver];

    /* If there was a previous observer, stop it now that a replacement has been started. */
    if (lastObserver) {
      lastObserver.stop();
      log("Stopped", join.Coll._name, lastObserver._id);
    }
  }

  /* Start an observer that will publish documents to client. */
  const observer = Coll.find(selector, {
    fields: Object.assign(
      normalizeFields(ownFields),
      noPublish ? { _id: 1 } : {}
    ),
    ...options,
  }).observeChanges({
    added: (_id, fields) => {
      !noPublish && ctx.added(collName, _id, fields);
      updateJoins("added", _id, fields);
    },

    changed: (_id, fields) => {
      !noPublish && ctx.changed(collName, _id, fields);
      updateJoins("changed", _id, fields);
    },

    removed: (_id) => {
      !noPublish && ctx.removed(collName, _id);
      updateJoins("removed", _id);
    },
  });

  /* Register a callback to stop the query handle when publication is stopped */
  ctx.onStop(() => {
    if (!observer._stopped) {
      observer.stop();
      log("Stopped", collName, observer._id);
    }
  });

  log("Started", collName, observer._id);

  /* Now that main observer is initiated, publish all joins. */
  joinsList.forEach(publishJoin);
  initiated = true;

  /* Return observer so that parent can stop it, if needed. */
  return observer;
}

/* Each selector updater function returns a tuple of [selector, fnToRemoveItems(ctx)]. */
function joinToSelectorUpdaters(join) {
  const { Coll, on, _key } = join;

  if (!Array.isArray(on)) {
    throw new Error(
      `Composite publication can only be done on array joins. Failed join '${_key}'`
    );
  }

  /* An array join can specify extra selector as third argument */
  const [from, to, onSelector = {}] = on;
  const fromArr = Array.isArray(from);
  const toArr = Array.isArray(to);

  let listById = {};

  const getItemsFromFields = (_id, fields) => {
    const fromValue = from === "_id" ? _id : fields[from];
    if (fromValue === undefined) return [];
    return fromArr ? fromValue : [fromValue];
  };

  const assembleList = () =>
    Object.values(listById).reduce((acc, vals) => union(acc, vals), []);

  const listToSelector = (list) => ({
    $and: [{ [toArr ? to[0] : to]: { $in: list } }, onSelector],
  });

  const listToRemovalFn = (listToRemove) => {
    if (isEmpty(listToRemove)) return undefined;

    return (ctx) =>
      Coll.find(listToSelector(listToRemove), {
        fields: { _id: 1 },
      }).forEach(({ _id }) => ctx.removed(Coll._name, _id));
  };

  return {
    added(_id, fields) {
      const addedItems = getItemsFromFields(_id, fields);

      const prevForId = listById[_id] || [];
      listById[_id] = union(prevForId, addedItems);

      const list = assembleList();
      return [listToSelector(list)];
    },

    changed(_id, fields) {
      const prevList = assembleList();

      listById[_id] = getItemsFromFields(_id, fields);

      const list = assembleList();
      const removedListItems = difference(prevList, list);

      return [listToSelector(list), listToRemovalFn(removedListItems)];
    },

    removed(_id) {
      const prevList = assembleList();

      listById[_id] = [];

      const list = assembleList();
      const removedListItems = difference(prevList, list);

      return [listToSelector(list), listToRemovalFn(removedListItems)];
    },
  };
}
