import { isFunc, typeOf, warn } from "./util";

const KNOWN_TYPES = ["array", "function", "object"];
const knownTypesCaption = KNOWN_TYPES.join("', '");

/* Single map that holds definitions of all collection hooks by collection name */
let joinsDictionnary = {};

/* Attach joins on the collection.
 * A join has the shape { Coll, on, single, ...options }, where
 *   - Coll: The joined Meteor collection
 *   - on: selector || fn(doc) => selector || [fromProp, toProp]
 *   - single: boolean. When `true`, linked as a single document, otherwise as an array
 *   - postFetch: fn(joinedDocsOrDoc, doc). Transformation function applied after fetch
 *   - ...options: Other options to be passed to the `fetch` or `find` operation.
 * Joins should be declared after all collections have been loaded, either by importing
 * collections in a different file or by wrapping in a `Meteor.startup(() => {<joins here>})` callback. */
export default function join(Collection, joins) {
  const collName = Collection._name;

  if (!joins) {
    joinsDictionnary[collName] = undefined;
    return;
  }

  Object.entries(joins).forEach(([key, { Coll, on, fields }]) => {
    if (!Coll) {
      throw new TypeError(
        `Collection for '${key}' join on '${collName}' must be an instance of 'Mongo.Collection'. Collection might not have been properly imported yet. Try wrapping join definitions in a 'Meteor.startup(() => {<joins here>})' callback or in a file that will be loaded after all collections.`
      );
    }

    if (!on) {
      throw new Error(
        `Join '${key}' on collection '${collName}' has no 'on' condition specified.`
      );
    }

    const joinType = typeOf(on);
    if (!KNOWN_TYPES.includes(joinType)) {
      throw new Error(
        `Join '${key}' on collection '${collName}' has an unrecognized 'on' condition type of '${joinType}'. Should be one of '${knownTypesCaption}'.`
      );
    }

    if (isFunc(on) && !fields) {
      warn(
        `Join '${key}' on collection '${collName}' is defined with a function 'on', but no 'fields' are explicitely specified. This could lead to failed joins if the keys necessary for the join are not specified at query time.`
      );
    }
  });

  joinsDictionnary[collName] = { ...joinsDictionnary[collName], ...joins };
}

export function getJoins(Coll) {
  return joinsDictionnary[Coll._name] || {};
}
