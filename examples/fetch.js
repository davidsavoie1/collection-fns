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
