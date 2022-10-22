import { typeOf } from "./util";

/* `Meteor.userId()` can only be called inside a Meteor method. Return `null` otherwise. */
export function getUserId() {
  try {
    return Meteor.userId();
  } catch (e) {
    return null;
  }
}

export function normalizeFields(fields, flatten = false) {
  if (typeOf(fields) !== "object") return fields ? undefined : {};
  if (!flatten) return fields;
  return flattenFields(fields);
}

/* Take a general field specifiers object (which could include nested objects)
 * and flatten it into a MongoDB compatible one with dot notation.
 * See https://docs.mongodb.com/manual/tutorial/project-fields-from-query-results/#projection. */
export function flattenFields(fields, root) {
  if (!fields) return fields;

  const keys = Object.keys(fields);

  /* Do not flatten fields if they contain a key that starts with $ (such as { $elemMatch }) */
  if (keys.some((k) => k.startsWith("$")))
    return root ? { [root]: fields } : fields;

  return keys.reduce((acc, k) => {
    /* If key is a dot string, omit it if its sub root is
     * already declared as selected to prevent path collisions. */
    const dotStrIndex = k.indexOf(".");
    if (dotStrIndex >= 0) {
      const subRoot = k.slice(0, dotStrIndex);
      const subRootSelection = fields[subRoot];
      if (subRootSelection && typeof subRootSelection !== "object") return acc;
    }

    const shouldSelect = fields[k];
    const dotKey = root ? [root, k].join(".") : k;
    if (typeof shouldSelect !== "object")
      return { ...acc, [dotKey]: !!shouldSelect };

    return { ...acc, ...flattenFields(shouldSelect, dotKey) };
  }, undefined);
}

/* Take a `fields` object and return sub fields by join key, with `_` for own fields. */
export function parseFields(fields = true, joinKeys = []) {
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

export function dispatchFields(fields, joins = {}) {
  const joinKeys = Object.keys(joins);
  let { _: ownFields, ...joinFields } = parseFields(fields, joinKeys);

  /* Join keys must be explicitely specified in the query's `fields` option
   * to prevent unnecessary overfetching. Otherwise, could also lead to potential infinite loops. */
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

  return { _: normalizeFields(ownFields, true), ...joinFields };
}
