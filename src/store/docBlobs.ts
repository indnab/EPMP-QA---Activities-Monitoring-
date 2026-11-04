/**
 * Tiny IndexedDB wrapper for uploaded document files (id -> Blob). Keeping file content out of the persisted
 * zustand state avoids the ~5 MB localStorage limit.
 */
const DB = 'qa-tracker-docs'
const STORE = 'files'
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const req = fn(tx.objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}
export const putBlob = (id: string, blob: Blob) => run('readwrite', (s) => s.put(blob, id)).then(() => undefined)
export const getBlob = (id: string) => run<Blob | undefined>('readonly', (s) => s.get(id) as IDBRequest<Blob | undefined>)
export const deleteBlob = (id: string) => run('readwrite', (s) => s.delete(id)).then(() => undefined)
export const clearBlobs = () => run('readwrite', (s) => s.clear()).then(() => undefined)
