import { useState, useEffect, useRef } from 'react';

export function usePersistedState(key, defaultValue) {
  const fullKey = `dmd_${key}`;

  const [state, setState] = useState(() => {
    try {
      const saved = localStorage.getItem(fullKey);
      if (saved !== null) return JSON.parse(saved);
    } catch {}
    return defaultValue;
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        if (state === defaultValue && typeof defaultValue !== 'object') {
          localStorage.removeItem(fullKey);
        } else {
          localStorage.setItem(fullKey, JSON.stringify(state));
        }
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [fullKey, state, defaultValue]);

  return [state, setState];
}

const DB_NAME = 'dmd-form-images';
const DB_VERSION = 1;
const STORE_NAME = 'refs';

function openFormDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  try {
    const db = await openFormDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

async function idbSet(key, value) {
  try {
    const db = await openFormDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      if (value === null || (Array.isArray(value) && value.length === 0)) {
        store.delete(key);
      } else {
        store.put(value, key);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {}
}

export function usePersistedImages(key, defaultValue = []) {
  const fullKey = `dmd_img_${key}`;
  const [state, setState] = useState(defaultValue);
  const loaded = useRef(false);
  const mounting = useRef(true);

  useEffect(() => {
    let cancelled = false;
    idbGet(fullKey).then(saved => {
      if (!cancelled && saved && Array.isArray(saved) && saved.length > 0) {
        setState(saved);
      }
      loaded.current = true;
      mounting.current = false;
    });
    return () => { cancelled = true; };
  }, [fullKey]);

  useEffect(() => {
    if (!loaded.current || mounting.current) return;
    const timer = setTimeout(() => {
      idbSet(fullKey, state);
    }, 500);
    return () => clearTimeout(timer);
  }, [fullKey, state]);

  return [state, setState];
}

export function usePersistedImage(key) {
  const fullKey = `dmd_img_${key}`;
  const [state, setState] = useState(null);
  const loaded = useRef(false);
  const mounting = useRef(true);

  useEffect(() => {
    let cancelled = false;
    idbGet(fullKey).then(saved => {
      if (!cancelled && saved) {
        setState(saved);
      }
      loaded.current = true;
      mounting.current = false;
    });
    return () => { cancelled = true; };
  }, [fullKey]);

  useEffect(() => {
    if (!loaded.current || mounting.current) return;
    const timer = setTimeout(() => {
      idbSet(fullKey, state);
    }, 500);
    return () => clearTimeout(timer);
  }, [fullKey, state]);

  return [state, setState];
}
