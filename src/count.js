import { find } from "./find";

export default function count(Coll, ...args) {
  return find(Coll, ...args).count();
}
