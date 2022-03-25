import { find } from "./find";

/* Alias for `find`. Returns a cursor. */
export default function cursor(...args) {
  return find(...args);
}
