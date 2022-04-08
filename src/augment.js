import { typeOf } from "./util";

const KNOWN_TYPES = ["function", "object"];
const knownTypesCaption = KNOWN_TYPES.join("', '");

/* Single map that holds definitions of all collection hooks by collection name */
let augmentsDictionnary = {};

/* Associate augments props to a Collection. Can be applied multiple times,
 * but identical keys will be merged with latest kept.
 *
 * augments: { ...[key]: augment }
 *   where augment: (doc) => propValue
 *               or {
 *                    when: (doc) => shouldApplyAugment
 *                       or dotPath  -- `doc` has defined value at dot path
 *                       or [...dotPath] -- `doc` has defined value at ALL dot paths
 *                       or { ...[dotPath]: any } -- `doc` has defined value at ANY dot path key,
 *                    fn: augmentFn
 *                  } */
export default function augment(Collection, augments = {}) {
  const collName = Collection._name;

  const enhancedAugments = Object.fromEntries(
    Object.entries(augments).map(([key, arg]) => {
      const augmentType = typeOf(arg);
      if (!KNOWN_TYPES.includes(augmentType)) {
        throw new Error(
          `Augment '${key}' on collection '${collName}' has an unrecognized type of '${augmentType}'. Should be one of '${knownTypesCaption}'.`
        );
      }

      /* If already a function, return entry as is. */
      if (augmentType === "function") return [key, arg];

      if (augmentType === "object") {
        const { fn, when } = arg;
        if (typeOf(fn) !== "function") {
          throw new Error(
            `Augment '${key}' on collection '${collName}' has no 'fn' function specified.`
          );
        }

        return [key, { fn, when: whenToPred(when) }];
      }
    })
  );

  augmentsDictionnary[collName] = {
    ...augmentsDictionnary[collName],
    ...enhancedAugments,
  };
}

export function getAugments(Coll) {
  return augmentsDictionnary[Coll._name] || {};
}

export function getAugmentFn(Coll) {
  const augments = getAugments(Coll);
  const augmentEntries = Object.entries(augments);

  if (augmentEntries.length < 1) return (doc) => doc;

  return function augmentFn(doc) {
    return augmentEntries.reduce((acc, [key, arg]) => {
      const type = typeOf(arg);

      if (type === "function") return { ...acc, [key]: arg(acc) };

      if (type === "object") {
        const { fn, when } = arg;
        if (when(acc)) return { ...acc, [key]: fn(acc) };
        return acc;
      }

      return acc;
    }, doc);
  };
}

function whenToPred(when) {
  const whenType = typeOf(when);
  if (whenType === "function") return when;
  if (whenType === "string") return (doc) => whenAll([when], doc);
  if (whenType === "array") return (doc) => whenAll(when, doc);
  if (whenType === "object") return (doc) => whenSome(Object.keys(when), doc);
  return () => true;
}

function whenAll(keys, doc) {
  return keys.every((k) => hasKey(k, doc));
}

function whenSome(keys, doc) {
  return keys.some((k) => hasKey(k, doc));
}

function hasKey(key, doc) {
  if (typeOf(doc) !== "object") return false;

  const dotIndex = key.indexOf(".");
  const rootKey = dotIndex >= 0 ? key.slice(0, dotIndex) : key;
  const restKey = dotIndex >= 0 ? key.slice(dotIndex + 1) : "";
  const subVal = doc[rootKey];

  if (!restKey) return subVal !== undefined;
  return hasKey(restKey, subVal);
}
