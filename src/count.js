export default function count(Coll, ...args) {
  return Coll.find(...args).count();
}
