import { normalizeFields } from "./helpers";

export function observe(
  Coll,
  {
    fields = {},
    selector = {},
    skipInit = true,
    added, // (document)
    addedAt, // (document, atIndex, before)
    changed, // (newDocument, oldDocument)
    changedAt, // (newDocument, oldDocument, atIndex)
    initAdded, // (document)
    initAddedAt, // (document, atIndex, before)
    removed, // (oldDocument)
    removedAt, // (oldDocument, atIndex)
    movedTo, // (document, fromIndex, toIndex, before)
    ...options
  } = {}
) {
  let initialized = false;

  const handleAdded = (...args) => {
    if (!initialized) {
      if (initAdded) initAdded(...args);
      if (!skipInit && added) added(...args);
    } else if (added) {
      added(...args);
    }
  };

  const handleAddedAt = (...args) => {
    if (!initialized) {
      if (initAddedAt) initAddedAt(...args);
      if (!skipInit && addedAt) addedAt(...args);
    } else if (addedAt) {
      addedAt(...args);
    }
  };

  const handle = Coll.find(selector, {
    ...options,
    fields: normalizeFields(fields, true),
  }).observe({
    added: (added || initAdded) && handleAdded,
    addedAt: (addedAt || initAddedAt) && handleAddedAt,
    changed,
    changedAt,
    removed,
    removedAt,
    movedTo,
  });

  initialized = true;
  return handle;
}

export function observeChanges(
  Coll,
  {
    fields = {},
    selector = {},
    skipInit = true,
    added, // (id, fields)
    addedBefore, // (id, fields, before)
    changed, // (id, fields)
    initAdded, // (id, fields)
    initAddedBefore, // (id, fields, before)
    movedBefore, // (id, before)
    removed, // (id)
    ...options
  } = {}
) {
  let initialized = false;

  const handleAdded = (...args) => {
    if (!initialized) {
      if (initAdded) initAdded(...args);
      if (!skipInit && added) added(...args);
    } else if (added) {
      added(...args);
    }
  };

  const handleAddedBefore = (...args) => {
    if (!initialized) {
      if (initAddedBefore) initAddedBefore(...args);
      if (!skipInit && addedBefore) addedBefore(...args);
    } else if (addedBefore) {
      addedBefore(...args);
    }
  };

  const handle = Coll.find(selector, {
    ...options,
    fields: normalizeFields(fields, true),
  }).observeChanges({
    added: (added || initAdded) && handleAdded,
    addedBefore: (addedBefore || initAddedBefore) && handleAddedBefore,
    changed,
    movedBefore,
    removed,
  });

  initialized = true;
  return handle;
}
