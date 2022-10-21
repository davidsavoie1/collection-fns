import { getAugmentFn } from "./augment";
import { dispatchFields, normalizeFields } from "./helpers";
import { getJoins } from "./join";
import { includesSome, isFunc, typeOf } from "./util";

/* Retrieve documents of a collection, including joined collections subdocuments.
 * Joins are used only if they are declared explicitely in the query's `fields`.
 * `fields` option differs from native Meteor collections' one, in that it accepts
 * nested objects instead of dot notation only.
 * Joins are defined on the collection with the `join` method. */
export function fetch(Collection, selector = {}, options = {}) {
  const joins = getJoins(Collection);
  const augmenter = getAugmentFn(Collection);

  const collTransform = Collection._transform;
  const { fields, transform = collTransform, ...restOptions } = options;

  const { _: ownFields, ...joinFields } = dispatchFields(fields, joins);
  const usedJoinKeys = Object.keys(joinFields);

  /* Use joins only if they are defined and used. If fields are defined, but not
   * as an object, also omit joins. */
  if (
    !joins ||
    usedJoinKeys.length <= 0 ||
    (fields && typeof fields !== "object")
  ) {
    return Collection.find(selector, {
      ...options,
      fields: ownFields,
    }).map(augmenter);
  }

  /* === END FETCH WHEN NO JOINS === */

  /* When joins exist, exclude `transform` from first fetch to reapply it after joining. */
  const docs = Collection.find(selector, {
    ...restOptions,
    fields: ownFields,
    transform: null,
  }).fetch();

  /* Partition joins by type to treat them differently */
  const joinsByType = usedJoinKeys.reduce((acc, joinKey) => {
    const join = joins[joinKey];
    if (!join) return acc;

    const type = typeOf(join.on);
    const enhancedJoin = { ...join, _key: joinKey };
    const prev = acc[type] || [];
    return { ...acc, [type]: [...prev, enhancedJoin] };
  }, {});

  const {
    array: arrJoins = [],
    object: objJoins = [],
    function: fnJoins = [],
  } = joinsByType;

  /* If `on` is an array of type `[fromProp, toProp]`,
   * fetch all sub docs at once before distributing them.
   * `fromProp` can be specified as an array with single element
   * (ie `["fromProp"]`) if source document references multiple joined docs. */
  const docsWithArrJoins = arrJoins.reduce((_docs, join) => {
    const {
      _key,
      Coll,
      on,
      single,
      postFetch,
      limit: joinLimit,
      ...joinRest
    } = join;

    const [fromProp, toProp, toSelector = {}] = on;
    const fromArray = Array.isArray(fromProp);
    const propList = fromArray
      ? _docs.flatMap((doc) => doc[fromProp[0]])
      : _docs.map((doc) => doc[fromProp]);

    const toArray = Array.isArray(toProp);
    const subSelector = toArray
      ? { ...toSelector, [toProp[0]]: { $elemMatch: { $in: propList } } }
      : { ...toSelector, [toProp]: { $in: propList } };

    const subJoinFields = joinFields[_key];
    const { _: own } = dispatchFields(
      subJoinFields,
      Object.keys(getJoins(Coll) || {})
    );
    const allOwnIncluded = !own || Object.keys(own).length <= 0;
    const shouldAddToProp =
      typeOf(subJoinFields) === "object" && !allOwnIncluded && toProp !== "_id";

    const fields = shouldAddToProp
      ? { ...subJoinFields, [toProp]: 1 }
      : subJoinFields;

    const subOptions = {
      ...options,
      ...joinRest,
      fields: normalizeFields(fields),
      limit: undefined,
    };

    const allJoinedDocs = fetch(Coll, subSelector, subOptions);

    const indexedByToProp = toArray
      ? {}
      : allJoinedDocs.reduce((acc, joinedDoc) => {
          if (!joinedDoc) return acc;

          const toPropValue = joinedDoc[toProp];
          const prev = acc[toPropValue] || [];
          return { ...acc, [toPropValue]: [...prev, joinedDoc] };
        }, {});

    return _docs.map((doc) => {
      let joinedDocs = [];

      if (toArray) {
        joinedDocs = allJoinedDocs.filter((joinedDoc) => {
          const toList = joinedDoc[toProp[0]] || [];
          if (!fromArray) return toList.includes(doc[fromProp]);

          const fromList = doc[fromProp[0]] || [];
          return includesSome(toList, fromList);
        });
      } else if (fromArray) {
        const fromValues = doc[fromProp[0]] || [];
        joinedDocs = fromValues.flatMap(
          (fromValue) => indexedByToProp[fromValue] || []
        );
      } else {
        const fromValue = doc[fromProp];
        joinedDocs = indexedByToProp[fromValue] || [];
      }

      const raw = single ? joinedDocs[0] : joinedDocs;
      const afterPostFetch = isFunc(postFetch) ? postFetch(raw, doc) : raw;
      return { ...doc, [_key]: afterPostFetch };
    });
  }, docs);

  /* If join is of type object, it is static and all docs will use the same joined docs.
   * However, they could differ in their `postFetch` treatment, since parent document
   * is passed as an argument. Hence, fetch all joined docs once, then return a new
   * doc enhancer function that will be applied later. */
  const objJoinsEnhancers = objJoins.map((join) => {
    const { _key, on } = join;
    const subSelector = on;
    return createJoinFetcher({
      join,
      fields: joinFields[_key],
      subSelector,
      options: restOptions,
    });
  });

  /* For each document, apply all `objJoinsEnhancers` defined for object type joins,
   * then use function joins and associate their results. */
  return docsWithArrJoins.map((doc) => {
    const docWithObjJoins = objJoinsEnhancers.reduce(
      (_doc, fn) => fn(_doc),
      doc
    );

    const docWithFnJoins = fnJoins.reduce((_doc, join) => {
      const { _key, on } = join;

      const joinFetcher = createJoinFetcher({
        join,
        fields: joinFields[_key],
        subSelector: isFunc(on) ? on(doc) : on,
        options: restOptions,
      });

      return joinFetcher(_doc);
    }, docWithObjJoins);

    /* Apply transform function to each document with all joins */
    return augmenter(
      isFunc(transform) ? transform(docWithFnJoins) : docWithFnJoins
    );
  });
}

/* Alias for `fetch` that is less likely to interfere with Window.fetch. */
export const fetchList = fetch;

/* Same as `fetch`, but returns a single document. */
export function fetchOne(Collection, selector, options = {}) {
  return fetch(Collection, selector, { ...options, limit: 1 })[0];
}

export const fetchIds = (Coll, selector) =>
  fetchList(Coll, selector, { fields: { _id: 1 } }).map(({ _id }) => _id);

/* HELPERS */

/* Create a function that takes a `doc` and returns
 * a single joined doc (if `single` is true) or an array of joined docs. */
function createJoinFetcher({
  join: { _key, Coll, on, single, postFetch, limit: joinLimit, ...joinRest },
  fields,
  subSelector,
  options,
}) {
  const subOptions = {
    ...options,
    ...joinRest,
    fields: normalizeFields(fields),
    limit: single ? 1 : joinLimit || undefined,
  };

  const joinedDocs = fetch(Coll, subSelector, subOptions);

  return (doc) => {
    const raw = single ? joinedDocs[0] : joinedDocs;
    const afterPostFetch = isFunc(postFetch) ? postFetch(raw, doc) : raw;
    return { ...doc, [_key]: afterPostFetch };
  };
}
