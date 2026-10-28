/** One-time storage migration. Legacy names are used only to recover existing data. */
(() => {
  const legacyKeys = {
    'carpedio-grades-v1': 'yael-grades-v1',
    'carpedio-theme': 'forma-theme',
    'carpedio-motion': 'forma-motion',
    'carpedio-calendar-view': 'forma-calendar-view',
  };
  function read(key) {
    const current = localStorage.getItem(key);
    if (current !== null || !legacyKeys[key]) return current;
    const previous = localStorage.getItem(legacyKeys[key]);
    if (previous === null) return null;
    try {
      localStorage.setItem(key, previous);
      // Remove the old key only after verifying that the new copy is durable.
      if (localStorage.getItem(key) === previous) localStorage.removeItem(legacyKeys[key]);
    } catch { /* Still return the existing data when storage is full or read-only. */ }
    return previous;
  }
  function write(key, value) {
    localStorage.setItem(key, value);
    if (legacyKeys[key]) {
      try { localStorage.removeItem(legacyKeys[key]); } catch { /* The new value was saved. */ }
    }
  }
  globalThis.CarpedIOStorage = Object.freeze({read, write});
  for (const key of Object.keys(legacyKeys)) {
    try { read(key); } catch { /* Optional browser storage must not block startup. */ }
  }
})();
