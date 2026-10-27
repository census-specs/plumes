// Stockage local (IndexedDB) : une table "notes" et une table "taches".
const DB = (() => {
  let base;

  function ouvrir() {
    return new Promise((resolve, reject) => {
      if (base) return resolve(base);
      const req = indexedDB.open('plume', 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        d.createObjectStore('notes', { keyPath: 'id' });
        d.createObjectStore('taches', { keyPath: 'id' });
      };
      req.onsuccess = () => { base = req.result; resolve(base); };
      req.onerror = () => reject(req.error);
    });
  }

  async function operation(table, mode, fn) {
    const d = await ouvrir();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(table, mode);
      const req = fn(tx.objectStore(table));
      tx.oncomplete = () => resolve(req && req.result);
      tx.onerror = () => reject(tx.error);
    });
  }

  return {
    tout: (table) => operation(table, 'readonly', (s) => s.getAll()),
    lire: (table, id) => operation(table, 'readonly', (s) => s.get(id)),
    enregistrer: (table, objet) => operation(table, 'readwrite', (s) => s.put(objet)),
    supprimer: (table, id) => operation(table, 'readwrite', (s) => s.delete(id)),
    nouvelId: () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
  };
})();
