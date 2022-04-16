/* Create indexes on the MongoDB collection.
 * Each index must be specified as { keys, ...options }.
 * Refer to [MongoDB documentation](https://docs.mongodb.com/manual/reference/method/db.collection.createIndex/index.html) */
export default function createIndexes(Collection, ...indexes) {
  indexes.forEach(({ index, ...options }) => {
    try {
      Collection.createIndex(index, options);
    } catch (err) {
      const strKeys = JSON.stringify(index);
      // eslint-disable-next-line no-console
      console.warn(
        `An error occured while creating index on keys ${strKeys} of "${
          Collection._name
        }" collection: ${err.errmsg || err.message}.`
      );
    }
  });
}
