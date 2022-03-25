import { isArr, isFunc } from "./util";

const KNOWN_HOOKS = [
  // insert
  "beforeInsert",
  "validateInsert",
  "afterInsert",
  // update
  "beforeUpdate",
  "validateUpdate",
  "afterUpdate",
  // remove
  "beforeRemove",
  "validateRemove",
  "afterRemove",
];

const SINGLE_HOOK_KEYS = ["validateInsert", "validateUpdate", "validateRemove"];

/* Single map that holds definitions of all collection hooks by collection name */
let hooksDictionnary = {};

export default function addHooks(Collection, hooksMap = {}) {
  const collName = Collection._name;
  if (!hooksDictionnary[collName]) hooksDictionnary[collName] = {};

  const collHooks = hooksDictionnary[collName];

  Object.entries(hooksMap).forEach(([key, hookOrHooks]) => {
    if (!KNOWN_HOOKS.includes(key)) {
      throw new Error(
        `Hooks type '${key}' on collection '${collName}' is not supported.`
      );
    }

    if (SINGLE_HOOK_KEYS.includes(key)) {
      if (!isFunc(hookOrHooks)) {
        throw new Error(
          `'${key}' hook on collection '${collName}' must be a function`
        );
      }

      if (collHooks[key]) {
        throw new Error(
          `'${key}' hook already exists on collection '${collName}'.`
        );
      }

      collHooks[key] = hookOrHooks;
      return;
    }

    const hooks = isArr(hookOrHooks) ? hookOrHooks : [hookOrHooks];
    const nonFunctionHook = hooks.find((hook) => !isFunc(hook));
    if (nonFunctionHook) {
      throw new Error(
        `A hook of type '${key}' on collection '${collName}' is not a function. Received '${JSON.stringify(
          nonFunctionHook,
          null,
          2
        )}'`
      );
    }

    const prevHooks = collHooks[key] || [];
    collHooks[key] = [...prevHooks, ...hooks];
  });
}

/* Return before, validate and after hooks for a method. */
export function getHooks(Coll, methodName) {
  const capitalized = [
    methodName.slice(0, 1).toUpperCase(),
    methodName.slice(1),
  ].join("");

  const collHooks = (Coll && hooksDictionnary[Coll._name]) || {};

  return {
    before: collHooks[`before${capitalized}`] || [],
    validate: collHooks[`validate${capitalized}`],
    after: collHooks[`after${capitalized}`] || [],
  };
}
