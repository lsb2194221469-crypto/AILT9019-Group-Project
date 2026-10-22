/* PDFs and quizzes remain on this browser/device. No credentials are stored. */
(() => {
  let database, baseline = null;
  function open() {
    if (!database) database = new Promise((resolve, reject) => {
      const request = indexedDB.open('lecture-lab-library', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('workspace');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('请关闭其他 Lecture Lab 页面后重试。'));
    });
    return database;
  }
  async function read() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('workspace', 'readonly');
      const request = transaction.objectStore('workspace').get('current');
      transaction.oncomplete = () => {
        baseline = structuredClone(request.result || null);
        resolve(request.result || null);
      };
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }
  async function write(value) {
    // A stale tab may save after another tab generated a quiz. Write only records
    // changed in this tab, inside the same transaction that reads the latest data.
    const incoming = structuredClone(value), previous = baseline;
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('workspace', 'readwrite');
      const store = transaction.objectStore('workspace'), request = store.get('current');
      request.onsuccess = () => {
        const latest = request.result || {};
        const deleted = new Set([...(latest.deletedQuizIds || []), ...(incoming.deletedQuizIds || [])]);
        const merged = {...latest, ...incoming, deletedQuizIds: [...deleted]};
        for (const key of ['documents', 'groups', 'quizzes']) {
          const records = new Map((latest[key] || []).map(record => [record.id, record]));
          const known = new Map((previous?.[key] || []).map(record => [record.id, record]));
          for (const record of incoming[key] || []) {
            if (JSON.stringify(record) !== JSON.stringify(known.get(record.id))) {
              records.set(record.id, key === 'groups' ? {...record,
                lastQuizNumber: Math.max(record.lastQuizNumber || 0, records.get(record.id)?.lastQuizNumber || 0)} : record);
            }
          }
          merged[key] = [...records.values()].filter(record => key !== 'quizzes' || !deleted.has(record.id));
        }
        store.put(merged, 'current');
      };
      // Track this tab's own snapshot, so later unchanged records never overwrite
      // newer edits in other tabs. Absence is not deletion; tombstones are explicit.
      transaction.oncomplete = () => { baseline = incoming; resolve(); };
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }
  window.LectureLibrary = Object.freeze({read, write});
})();
