export const DAY_MS = 24 * 60 * 60 * 1000;
export const normalizeName = (name) => name.trim().replace(/\s+/g, ' ');
export const validCycleDays = (days) => Number.isInteger(days) && days >= 1 && days <= 36500;

export function openDatabase(name = 'suishouji', initialTags = [], onBlocked = () => {}) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 2);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('tags')) {
        const tags = database.createObjectStore('tags', { keyPath: 'id' });
        tags.createIndex('group_name', ['group', 'name'], { unique: true });
        const now = new Date().toISOString();
        initialTags.forEach(([group, name], order) => tags.add({ id: crypto.randomUUID(), group, name, order, createdAt: now }));
      }
      const events = database.objectStoreNames.contains('events')
        ? request.transaction.objectStore('events')
        : database.createObjectStore('events', { keyPath: 'id' });
      if (!events.indexNames.contains('tagId')) events.createIndex('tagId', 'tagId');
      if (!events.indexNames.contains('occurredAt')) events.createIndex('occurredAt', 'occurredAt');
      if (!events.indexNames.contains('tag_time')) events.createIndex('tag_time', ['tagId', 'occurredAt']);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = onBlocked;
  });
}

// The lookup and insert share one read/write transaction, including across tabs.
export function recordOnce(database, event) {
  return new Promise((resolve, reject) => {
    const tx = database.transaction(['tags', 'events'], 'readwrite');
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('保存中断'));
    const tagRequest = tx.objectStore('tags').get(event.tagId);
    tagRequest.onsuccess = () => {
      const tag = tagRequest.result;
      if (!tag || tag.archived) { result = { status: 'unavailable' }; return; }
      const events = tx.objectStore('events');
      const save = () => { events.add({ ...event, tagName: tag.name, group: tag.group, timestampEnabled: Boolean(tag.timestampEnabled), cycleDays: tag.cycleDays ?? null }); result = { status: 'saved' }; };
      // Timestamp cycles group observations; they do not limit event frequency.
      if (tag.timestampEnabled || !tag.cycleDays) { save(); return; }
      if (!validCycleDays(tag.cycleDays)) { result = { status: 'invalid-cycle' }; return; }
      const range = IDBKeyRange.bound([tag.id, ''], [tag.id, '\uffff']);
      const latest = events.index('tag_time').openCursor(range, 'prev');
      latest.onsuccess = () => {
        const previous = latest.result?.value;
        const nextAt = previous ? Date.parse(previous.occurredAt) + tag.cycleDays * DAY_MS : null;
        if (nextAt !== null && Date.parse(event.occurredAt) < nextAt) {
          result = { status: 'blocked', nextAt, previous }; return;
        }
        save();
      };
    };
  });
}
