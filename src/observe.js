import { normalizeFields } from "./helpers";

export function observe(
  Coll,
  {
    fields = {},
    selector = {},
    skipInit = false,
    added, // (document)
    addedAt, // (document, atIndex, before)
    changed, // (newDocument, oldDocument)
    changedAt, // (newDocument, oldDocument, atIndex)
    removed, // (oldDocument)
    removedAt, // (oldDocument, atIndex)
    movedTo, // (document, fromIndex, toIndex, before)
    ...options
  } = {}
) {
  let initialized = false;

  const handleAdded = (...args) => {
    if (!skipInit || initialized) return added(...args);
  };

  const handleAddedAt = (...args) => {
    if (!skipInit || initialized) return addedAt(...args);
  };

  const handle = Coll.find(selector, {
    ...options,
    fields: normalizeFields(fields, true),
  }).observe({
    added: added && handleAdded,
    addedAt: addedAt && handleAddedAt,
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
    skipInit = false,
    added, // (id, fields)
    addedBefore, // (id, fields, before)
    changed, // (id, fields)
    movedBefore, // (id, before)
    removed, // (id)
    ...options
  } = {}
) {
  let initialized = false;

  const handleAdded = (...args) => {
    if (!skipInit || initialized) return added(...args);
  };

  const handleAddedBefore = (...args) => {
    if (!skipInit || initialized) return addedBefore(...args);
  };

  const handle = Coll.find(selector, {
    ...options,
    fields: normalizeFields(fields, true),
  }).observeChanges({
    added: added && handleAdded,
    addedBefore: addedBefore && handleAddedBefore,
    changed,
    movedBefore,
    removed,
  });

  initialized = true;
  return handle;
}
