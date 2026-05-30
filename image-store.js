"use strict";

(() => {
  const DB_NAME = "image-search-store";
  const DB_VERSION = 1;
  const STORE_NAME = "images";
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB 打开失败"));
    });
  }

  async function withStore(mode, callback) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      const result = callback(store);
      transaction.oncomplete = () => {
        db.close();
        resolve(result);
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error || new Error("IndexedDB 操作失败"));
      };
      transaction.onabort = () => {
        db.close();
        reject(transaction.error || new Error("IndexedDB 操作中断"));
      };
    });
  }

  async function saveFile(file) {
    await cleanup();
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const record = {
      id,
      blob: file,
      fileName: file.name || "image",
      type: file.type || "application/octet-stream",
      size: file.size,
      createdAt: Date.now()
    };
    await withStore("readwrite", (store) => store.put(record));
    return id;
  }

  async function readFile(id) {
    const record = await readRecord(id);

    if (!record) {
      throw new Error("没有找到这次搜索的图片，请重新上传。");
    }
    return new File([record.blob], record.fileName, {
      type: record.type,
      lastModified: record.createdAt
    });
  }

  async function readRecord(id) {
    return new Promise(async (resolve, reject) => {
      let db = null;
      try {
        db = await openDb();
        const transaction = db.transaction(STORE_NAME, "readonly");
        const request = transaction.objectStore(STORE_NAME).get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error("读取图片失败"));
        transaction.oncomplete = () => db.close();
        transaction.onerror = () => {
          db.close();
          reject(transaction.error || new Error("读取图片失败"));
        };
      } catch (error) {
        if (db) {
          db.close();
        }
        reject(error);
      }
    });
  }

  async function saveSearchResult(id, searchResult) {
    const record = await readRecord(id);
    if (!record) {
      throw new Error("没有找到这次搜索的图片，请重新上传。");
    }
    await withStore("readwrite", (store) => {
      store.put({
        ...record,
        searchResult: {
          ...searchResult,
          completedAt: Date.now()
        }
      });
    });
  }

  async function readSearchResult(id) {
    const record = await readRecord(id);
    if (!record) {
      throw new Error("没有找到这次搜索的图片，请重新上传。");
    }
    if (!record.searchResult) {
      throw new Error("搜索尚未完成，请从等待页完成搜索后再查看结果。");
    }
    return record.searchResult;
  }

  async function cleanup(maxAgeMs = ONE_DAY_MS) {
    const cutoff = Date.now() - maxAgeMs;
    try {
      await withStore("readwrite", (store) => {
        const request = store.openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) {
            return;
          }
          if ((cursor.value.createdAt || 0) < cutoff) {
            cursor.delete();
          }
          cursor.continue();
        };
      });
    } catch {
      // Cleanup is opportunistic; failing it should not block a search.
    }
  }

  globalThis.ImageSearchStore = {
    cleanup,
    readFile,
    readSearchResult,
    saveSearchResult,
    saveFile
  };
})();
