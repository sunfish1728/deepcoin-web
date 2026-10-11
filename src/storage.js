export function read(key, fallback) { try { return JSON.parse(localStorage.getItem('deepcoin.' + key)) ?? fallback; } catch { return fallback; } }
export function write(key, value) { localStorage.setItem('deepcoin.' + key, JSON.stringify(value)); }
let dbPromise;
function database() {
  return dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('deepcoin-avatars', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('avatars', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function avatarStore(method, value) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('avatars', method === 'getAll' ? 'readonly' : 'readwrite');
    const request = tx.objectStore('avatars')[method](value);
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('形象儲存失敗'));
  });
}
