// ── Client-Side Project Storage (IndexedDB) ───────────────────────────
// This file replaces the server-side API calls with a local IndexedDB store.
// This allows Sticherr to run as a 100% serverless, client-side application.

const DB_NAME = 'SticherrDB';
const DB_VERSION = 1;
const STORE_NAME = 'projects';

const thumbCache = new Map();
let activeProject = null;

// Initialize or open IndexedDB database
function getDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

export async function getStorageStats() {
  // Return dummy storage stats for client-side compatibility
  return {
    usedBytes: 0,
    totalBytes: 50 * 1024 * 1024 * 1024, // 50GB dummy
    projectCount: thumbCache.size,
  };
}

export async function saveImage() {
  // Stub for client-side compatibility
  return { success: true };
}

// =============================================================================
// Stitcher Project API (IndexedDB Implementation)
// =============================================================================

export async function listProjects() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const projects = request.result || [];
      // Populate thumbnail cache
      projects.forEach((p) => {
        if (p.sourceBase64) {
          thumbCache.set(p.id, `data:${p.sourceMimeType};base64,${p.sourceBase64}`);
        }
      });
      // Sort projects by updatedAt descending
      const sorted = projects.map(p => ({
        id: p.id,
        name: p.name,
        updatedAt: p.updatedAt || Date.now(),
      })).sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(sorted);
    };

    request.onerror = () => reject(request.error);
  });
}

export async function createProject(data) {
  const db = await getDB();
  const id = crypto.randomUUID();
  const project = {
    ...data,
    id,
    updatedAt: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add(project);

    request.onsuccess = () => {
      if (project.sourceBase64) {
        thumbCache.set(id, `data:${project.sourceMimeType};base64,${project.sourceBase64}`);
      }
      activeProject = project;
      resolve({ project: { id } });
    };

    request.onerror = () => reject(request.error);
  });
}

export async function loadProject(id) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      const project = request.result;
      if (!project) {
        reject(new Error('Project not found'));
      } else {
        activeProject = project;
        resolve(project);
      }
    };

    request.onerror = () => reject(request.error);
  });
}

export async function updateProject(id, data) {
  const db = await getDB();
  const existing = await loadProject(id);
  const updated = {
    ...existing,
    ...data,
    id,
    updatedAt: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(updated);

    request.onsuccess = () => {
      if (updated.sourceBase64) {
        thumbCache.set(id, `data:${updated.sourceMimeType};base64,${updated.sourceBase64}`);
      }
      activeProject = updated;
      resolve({ project: { id } });
    };

    request.onerror = () => reject(request.error);
  });
}

export async function deleteProject(id) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => {
      thumbCache.delete(id);
      if (activeProject && activeProject.id === id) {
        activeProject = null;
      }
      resolve({ success: true });
    };

    request.onerror = () => reject(request.error);
  });
}

export async function uploadLayerImage() {
  // Stub - layer image data is saved inline within the project data payload
  return { success: true };
}

export async function importProject(dmdData) {
  const db = await getDB();
  const id = dmdData.id || crypto.randomUUID();
  
  // Clean export-specific properties
  const project = { ...dmdData, id, updatedAt: Date.now() };
  delete project.type;
  delete project.version;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(project);

    request.onsuccess = () => {
      if (project.sourceBase64) {
        thumbCache.set(id, `data:${project.sourceMimeType};base64,${project.sourceBase64}`);
      }
      activeProject = project;
      resolve({ project: { id } });
    };

    request.onerror = () => reject(request.error);
  });
}

export function getProjectThumbUrl(id) {
  return thumbCache.get(id) || '';
}

export function getProjectSourceUrl() {
  return '';
}

export function getProjectLayerUrl() {
  return '';
}

export function getProjectRefUrl() {
  return '';
}

export function getProjectExportUrl(id) {
  if (activeProject && activeProject.id === id) {
    const exportData = {
      type: 'floui-stitcher-project',
      version: 1,
      ...activeProject,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    return URL.createObjectURL(blob);
  }
  return '';
}
