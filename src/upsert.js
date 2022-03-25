export default function upsert(
  Coll,
  selector,
  modifier,
  options = {},
  callback
) {
  return Coll.upsert(selector, modifier, options, callback);
}
