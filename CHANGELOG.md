# Changelog

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
