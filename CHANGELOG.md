# Changelog

## [NEXT] -

### Add

- Add `fetchIds` function in main export;
- Add `publish` function in main export. This function allows for very performant publications that use collection joins!

### Fix

- Do not flatten fields when at least one key starts with `$` (as in `{ $elemMatch: {} }` projection operator);

---

## [0.1.0] - 2022-05-30

### Break

- `skipInit` is now `true` by default in observers, so that methods can be split in two distinct phases;

### Add

- Split `added` and `initAdded` (and variations) in observers. Creates a breaking change where `skipInit` is now `true` by default;

---

## [0.0.11] - 2022-05-30

### Fix

- To array type joins not working, only from array joins are;

---

## [0.0.10] - 2022-05-16

### Add

- `observe` and `observeChanges` functions in main exports;

---

## [0.0.9] - 2022-04-29

### Fix

- Path collisions in dot string selections;

---

## [0.0.8] - 2022-04-26

### Fix

- Crash when `fromValues` is undefined in multi array join;

---

## [0.0.7] - 2022-04-26

### Fix

- Multiple callback type `beforeUpdate` hooks not working properly;

---

## [0.0.6] - 2022-04-15

### Fix

- Array joins take the limit option of main fetch options;

---

## [0.0.5] - 2022-04-15

### Grow

- Add `createIndexes` function to simplify index creation and prevent errors from crashing startup;
- Allow defining a complementary selector as third element in array joins;

### Fix

- Prevent very wrong and unwanted behavior where a `beforeRemove` hook removes all documents from collection;
- Correct behavior of array joins that would fetch the same document for all when single option was used;

---

## [0.0.4] - 2022-04-08

### Grow

- Use Map to store `augments` in insertion order so that they can be derived from previous ones;

---

## [0.0.3] - 2022-04-08

### Grow

- Add `augment` functionnality, which allows adding properties to fetched documents, with potential conditionnal usage;
- Export additionnal `fetchList` function in main API to prevent potential conflicts in browser when using `fetch` (considered as Window.fetch);

### Break

- Remove `find` and `findOne` functions and exports to prevent giving the impression that they might do something different than `Collection.find` or `findOne` methods;

---

## [0.0.2]

- Fix | Missing fields in nested sub fetch;

---

## [0.0.1]

- First code deploy!

---
