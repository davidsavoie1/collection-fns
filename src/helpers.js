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

  return Object.keys(fields).reduce((acc, k) => {
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
