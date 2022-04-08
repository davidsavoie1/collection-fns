/* Alias for `find`. Returns a cursor. */
export default function cursor(Coll, ...args) {
  return Coll.find(...args);
}
