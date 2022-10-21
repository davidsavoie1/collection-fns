export const typeOf = (obj) =>
  ({}.toString.call(obj).split(" ")[1].slice(0, -1).toLowerCase());

export const isArr = (x) => typeOf(x) === "array";
export const isEmpty = (x = []) => x.length <= 0;
export const isFunc = (x) => typeof x === "function";
export const isNil = (x) => [null, undefined].includes(x);
export const isObj = (x) => typeOf(x) === "object";

export const isSelector = (x) => isObj(x) || typeOf(x) === "string";
export const isModifier = (x) => isObj(x) && !isEmpty(Object.keys(x));

export function get2ndLevelFields(modifier) {
  if (!isModifier(modifier)) return [];
  return Object.values(modifier).flatMap((fieldsMap = {}) => {
    if (!isObj(fieldsMap)) return [];
    return [
      ...new Set(
        Object.keys(fieldsMap).map((key) => {
          const [rootKey] = key.split(".");
          return rootKey;
        })
      ),
    ];
  });
}

/* Combine two objects by merging their 2nd level props. */
export function assign(prev, added) {
  const allKeys = [...new Set([...Object.keys(prev), ...Object.keys(added)])];
  return allKeys.reduce(
    (acc, key) => ({ ...acc, [key]: { ...prev[key], ...added[key] } }),
    {}
  );
}

/* Return all elements from first list that are not present in the second one. */
export function difference(toKeep, toRemove) {
  return toKeep.filter((item) => toRemove.indexOf(item) < 0);
}

/* Check whether or not a source array includes any of the searched arrray values. */
export function includesSome(searchedArr, sourceArr) {
  return sourceArr.some((el) => searchedArr.indexOf(el) >= 0);
}

/* Combine elements from two lists, without duplicates. */
export function union(arr1, arr2) {
  const itemsToAdd = arr2.filter((item) => arr1.indexOf(item) < 0);
  return [...arr1, ...itemsToAdd];
}

/* eslint-disable no-console */
export const warn = (...args) =>
  console && console.warn && console.warn(...args);
/* eslint-enable no-console */
