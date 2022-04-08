import { getAugmentFn } from "./augment";
import { getJoins } from "./join";
import { isFunc, typeOf } from "./util";

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

  let { _: ownFields, ...joinFields } = parseFields(
    fields,
    Object.keys(joins || {})
  );

  /* Join keys must be explicitely specified in the query's `fields` option
   * to prevent unnecessary overfetching. Otherwise, could also lead to potential infinite loops. */
  const joinKeys = Object.keys(joins || {});
  const usedJoinKeys = !fields ? [] : joinKeys.filter((key) => !!fields[key]);

  const allOwnIncluded = !ownFields || Object.keys(ownFields).length <= 0;

  /* If not all own fields included, try to derive necessary fields
   * from used joins definitions (explicit when defined as `[]`,
   * otherwise possibly specified as `fields` on join document). */
  if (!allOwnIncluded) {
    const necessaryFields = usedJoinKeys.reduce((acc, joinKey) => {
      const { on, fields } = joins[joinKey];
      const onFields = Array.isArray(on) ? { [on[0]]: 1 } : undefined;
      if (!(onFields || fields)) return acc;
      return { ...acc, ...onFields, ...fields };
    }, undefined);

    ownFields = { ...ownFields, ...necessaryFields };
  }

  /* Use joins only if they are defined and used. If fields are defined, but not
   * as an object, also omit joins. */
  if (
    !joins ||
    usedJoinKeys.length <= 0 ||
    (fields && typeof fields !== "object")
  ) {
    return Collection.find(selector, { ...options, fields: ownFields }).map(
      augmenter
    );
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
    const { _key, Coll, on } = join;
    const [fromProp, toProp] = on;
    const fromArray = Array.isArray(fromProp);
    const propList = fromArray
      ? _docs.flatMap((doc) => doc[fromProp])
      : _docs.map((doc) => doc[fromProp]);
    const subSelector = { [toProp]: { $in: propList } };

    const subJoinFields = joinFields[_key];
    const parsed = parseFields(
      subJoinFields,
      Object.keys(getJoins(Coll) || {})
    );
    const { _: own } = parsed;
    const allOwnIncluded = !own || Object.keys(own).length <= 0;
    const shouldAddToProp =
      typeOf(subJoinFields) === "object" && !allOwnIncluded && toProp !== "_id";

    const fields = shouldAddToProp
      ? { ...subJoinFields, [toProp]: 1 }
      : subJoinFields;

    return _docs.map(
      createJoinFetcher({ join, fields, subSelector, options: restOptions })
    );
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

/* Take a general field specifiers object (which could include nested objects)
 * and flatten it into a MongoDB compatible one with dot notation.
 * See https://docs.mongodb.com/manual/tutorial/project-fields-from-query-results/#projection. */
function flattenFields(fields, root) {
  if (!fields) return fields;

  return Object.keys(fields).reduce((acc, k) => {
    const shouldSelect = fields[k];
    const dotKey = root ? [root, k].join(".") : k;
    if (typeof shouldSelect !== "object")
      return { ...acc, [dotKey]: !!shouldSelect };

    return { ...acc, ...flattenFields(shouldSelect, dotKey) };
  }, undefined);
}

function normalizeFields(fields, flatten = false) {
  if (typeOf(fields) !== "object") return fields ? undefined : {};
  if (!flatten) return fields;
  return flattenFields(fields);
}

function parseFields(fields = true, joinKeys = []) {
  const noFields = { _id: 1 };

  if (typeof fields !== "object")
    return fields ? { _: undefined } : { _: noFields };

  return Object.entries(fields).reduce(
    (acc, [key, val]) => {
      const [, radical, subKey] = /(^\w+)[.]*([\w.]*)/g.exec(key) || [];

      if (!joinKeys.includes(radical)) {
        if (typeof val === "object") {
          return { ...acc, _: { ...acc._, ...flattenFields(val, key) } };
        }

        return { ...acc, _: { ...acc._, [key]: !!val } };
      }

      if (!subKey) {
        return { ...acc, [radical]: val };
      }
      return { ...acc, [radical]: { ...acc[radical], [subKey]: val } };
    },
    { _: {} }
  );
}
