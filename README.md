# collection-fns

Functions used on Meteor collections to provide extra functionnality like performant and elegant hooks and inter-collections joins.

# API

## `fetchList` and `fetchOne`

Replaces `Coll.find().fetch()` and `Coll.find().fetchOne()`, enhancing result with collection [joins]() and [augments]().

`fields` options argument is greatly improved when joins are defined.

- If object with only own fields, acts as the basic collection behavior;
- If `undefined` or thruthy value, fetch all own fields;
- If join fields are specified, the joined collections will be recursively fetched with the same fields principles;
- If ONLY join fields are specified, all own fields will also be returned;
- If own fields AND join fields are specified, only those own fields will be fetched, along with the recursively fetched join documents;

### Example

```js
join(Parents, {
  children: {
    Coll: Children,
    on: ["_id", "parentId"],
  },
});

join(Children, {
  toys: {
    Coll: Toys,
    on: [["toyIds"], "_id_"],
  },
});

fetchList(
  Parents,
  {},
  {
    fields: {
      name: 1, // own -> only `name` from parents included with `children`
      children: {
        // join only -> all own `children` fields
        toys: { color: 1, forAge: 1 }, // only own limited `toys` fields
      },
    },
  }
);
```
