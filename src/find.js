export function find(Coll, selector, options = {}) {
  return Coll.find(selector, options);
}

export function findOne(Coll, selector, options = {}) {
  return Coll.findOne(selector, options);
}
