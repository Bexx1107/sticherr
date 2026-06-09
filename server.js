import express from 'express';
import session from 'express-session';
import SessionFileStore from 'session-file-store';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import sharp from 'sharp';
import cors from 'cors';

const PORT = process.env.PORT || 3002;
const DATA_DIR = path.resolve('./.user-data');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const SECRET_FILE = path.join(DATA_DIR, '.session-secret');
const DIST_DIR = path.resolve('./dist');

const THUMB_WIDTH = 400;
const THUMB_QUALITY = 80;

const MIME_TO_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
};

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

async function loadJson(filePath, fallback = []) {
  try {
    const raw = await fsp.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function saveJson(filePath, data) {
  const tmp = `${filePath}.tmp.${Date.now()}`;
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
  await fsp.rename(tmp, filePath);
}

async function getSessionSecret() {
  try {
    const existing = await fsp.readFile(SECRET_FILE, 'utf-8');
    if (existing.trim().length >= 32) return existing.trim();
  } catch {}

  const secret = crypto.randomBytes(48).toString('hex');
  await ensureDir(DATA_DIR);
  await fsp.writeFile(SECRET_FILE, secret, { mode: 0o600 });
  return secret;
}

function userProjectsDir(username) {
  return path.join(DATA_DIR, username, 'projects');
}

function userProjectsIndex(username) {
  return path.join(DATA_DIR, username, 'projects', 'projects-index.json');
}

function projectDir(username, projectId) {
  return path.join(DATA_DIR, username, 'projects', projectId);
}

async function getDirSize(dirPath) {
  let size = 0;
  try {
    const files = await fsp.readdir(dirPath, { withFileTypes: true });
    for (const file of files) {
      const filePath = path.join(dirPath, file.name);
      if (file.isDirectory()) {
        size += await getDirSize(filePath);
      } else {
        const stats = await fsp.stat(filePath);
        size += stats.size;
      }
    }
  } catch {}
  return size;
}

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const FileStore = SessionFileStore(session);

async function start() {
  await ensureDir(DATA_DIR);
  await ensureDir(SESSIONS_DIR);
  const secret = await getSessionSecret();

  app.use(
    session({
      store: new FileStore({
        path: SESSIONS_DIR,
        ttl: 86400,
        retries: 1,
        reapInterval: 3600,
      }),
      secret,
      resave: false,
      saveUninitialized: false,
      name: 'stitcher.sid',
      cookie: {
        httpOnly: true,
        secure: 'auto',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000,
      },
    })
  );

  // Automatically authenticate as default-user
  app.use((req, _res, next) => {
    if (!req.session) {
      req.session = {};
    }
    req.session.username = 'default-user';
    req.session.role = 'user';
    req.session.displayName = 'Local User';
    next();
  });

  // --- GET /api/me ---
  app.get('/api/me', (req, res) => {
    res.json({
      username: req.session.username,
      role: req.session.role,
      displayName: req.session.displayName,
    });
  });

  // --- POST /api/logout ---
  app.post('/api/logout', (req, res) => {
    res.json({ success: true });
  });

  // --- GET /api/storage/stats ---
  app.get('/api/storage/stats', async (req, res) => {
    const username = req.session.username;
    const userDir = path.join(DATA_DIR, username);
    await ensureDir(userDir);
    const size = await getDirSize(userDir);
    res.json({
      usedBytes: size,
      totalBytes: 20 * 1024 * 1024 * 1024, // 20GB limit representation
      usedPercent: Math.min(100, (size / (20 * 1024 * 1024 * 1024)) * 100),
    });
  });

  // --- POST /api/images (stub for history) ---
  app.post('/api/images', (req, res) => {
    res.json({
      success: true,
      entry: {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
      },
      pruneResult: { pruned: 0, freedBytes: 0 },
      stats: { usedBytes: 0, totalBytes: 20 * 1024 * 1024 * 1024 },
    });
  });

  // --- GET /api/images (stub for history list) ---
  app.get('/api/images', (req, res) => {
    res.json([]);
  });

  // =============================================================================
  // Stitcher Project Routes
  // =============================================================================

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function extFromMime(mimeType) {
    return MIME_TO_EXT[mimeType] || 'png';
  }

  function mimeFromExt(filename) {
    const ext = path.extname(filename).slice(1).toLowerCase();
    const map = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', avif: 'image/avif' };
    return map[ext] || 'image/png';
  }

  async function generateProjectThumbnail(projDir, sourcePath) {
    const thumbPath = path.join(projDir, 'thumb.jpg');
    await sharp(sourcePath)
      .resize(THUMB_WIDTH, THUMB_WIDTH, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: THUMB_QUALITY, mozjpeg: true })
      .toFile(thumbPath);
    return thumbPath;
  }

  // --- POST /api/projects --- Create project
  app.post('/api/projects', async (req, res) => {
    try {
      const { username } = req.session;
      const { name, sourceBase64, sourceMimeType, modelKey, editPrompt, aspectMode, featherRadius, resolution, entityRefs, layers } = req.body;

      if (!name || !sourceBase64 || !sourceMimeType) {
        return res.status(400).json({ error: 'name, sourceBase64, and sourceMimeType are required.' });
      }

      const projectId = crypto.randomUUID();
      const pDir = projectDir(username, projectId);
      await ensureDir(pDir);

      // Save source image
      const sourceExt = extFromMime(sourceMimeType);
      const sourceFilename = `source.${sourceExt}`;
      const sourceBuffer = Buffer.from(sourceBase64, 'base64');
      const sourcePath = path.join(pDir, sourceFilename);
      await fsp.writeFile(sourcePath, sourceBuffer);

      // Save entity reference images
      const refsData = [];
      if (Array.isArray(entityRefs)) {
        for (let i = 0; i < entityRefs.length; i++) {
          const ref = entityRefs[i];
          if (ref.base64 && ref.mimeType) {
            const refExt = extFromMime(ref.mimeType);
            const refFilename = `ref_${i}.${refExt}`;
            const refBuffer = Buffer.from(ref.base64, 'base64');
            await fsp.writeFile(path.join(pDir, refFilename), refBuffer);
            refsData.push({ filename: refFilename, mimeType: ref.mimeType, name: ref.name || null, instruction: ref.instruction || null });
          } else {
            refsData.push({ filename: null, name: ref.name || null, instruction: ref.instruction || null });
          }
        }
      }

      // Save layer result images
      const layersData = [];
      if (Array.isArray(layers)) {
        for (const layer of layers) {
          const layerEntry = { ...layer };
          delete layerEntry.resultBase64;
          delete layerEntry.resultMimeType;

          if (layer.resultBase64 && layer.resultMimeType) {
            const layerExt = extFromMime(layer.resultMimeType);
            const layerFilename = `layer_${layer.id}.${layerExt}`;
            const layerBuffer = Buffer.from(layer.resultBase64, 'base64');
            await fsp.writeFile(path.join(pDir, layerFilename), layerBuffer);
            layerEntry.resultFilename = layerFilename;
            layerEntry.resultMimeType = layer.resultMimeType;
          }
          layersData.push(layerEntry);
        }
      }

      // Build project.json
      const now = new Date().toISOString();
      const projectData = {
        id: projectId,
        name,
        createdAt: now,
        updatedAt: now,
        sourceFilename,
        sourceMimeType,
        modelKey: modelKey || null,
        editPrompt: editPrompt || null,
        aspectMode: aspectMode || null,
        featherRadius: featherRadius ?? null,
        resolution: resolution || null,
        entityRefs: refsData,
        layers: layersData,
      };
      await saveJson(path.join(pDir, 'project.json'), projectData);

      // Generate thumbnail from source
      try {
        await generateProjectThumbnail(pDir, sourcePath);
      } catch (e) {
        console.warn(`[projects] Thumbnail generation failed for ${projectId}:`, e.message);
      }

      // Update projects-index.json
      const indexPath = userProjectsIndex(username);
      await ensureDir(userProjectsDir(username));
      const index = await loadJson(indexPath, []);
      index.push({
        id: projectId,
        name,
        updatedAt: now,
        layerCount: layersData.length,
        thumbFilename: 'thumb.jpg',
      });
      await saveJson(indexPath, index);

      console.log(`[projects] User "${username}" created project "${name}" (${projectId})`);
      return res.json({ success: true, project: projectData });
    } catch (err) {
      console.error('[projects] Create error:', err);
      return res.status(500).json({ error: 'Failed to create project.' });
    }
  });

  // --- POST /api/projects/import --- Import .floui / .dmd file
  app.post('/api/projects/import', async (req, res) => {
    try {
      const { username } = req.session;
      let dmdData = req.body;

      if (typeof dmdData === 'string') {
        try {
          dmdData = JSON.parse(Buffer.from(dmdData, 'base64').toString('utf-8'));
        } catch {
          return res.status(400).json({ error: 'Invalid format. Expected JSON or base64-encoded JSON.' });
        }
      }

      if (dmdData.base64 && typeof dmdData.base64 === 'string') {
        try {
          dmdData = JSON.parse(Buffer.from(dmdData.base64, 'base64').toString('utf-8'));
        } catch {
          return res.status(400).json({ error: 'Invalid base64-encoded data.' });
        }
      }

      if (dmdData.type !== 'floui-stitcher-project' || !dmdData.project) {
        return res.status(400).json({ error: 'Invalid project file: missing type or project data.' });
      }

      const srcProject = dmdData.project;
      const projectId = crypto.randomUUID();
      const pDir = projectDir(username, projectId);
      await ensureDir(pDir);

      // Restore source image
      let sourceFilename = srcProject.sourceFilename || 'source.png';
      if (dmdData.sourceImage && dmdData.sourceImage.base64) {
        const srcExt = extFromMime(dmdData.sourceImage.mimeType || 'image/png');
        sourceFilename = `source.${srcExt}`;
        const srcBuffer = Buffer.from(dmdData.sourceImage.base64, 'base64');
        await fsp.writeFile(path.join(pDir, sourceFilename), srcBuffer);
      }

      // Restore layer images
      const layersData = [];
      if (Array.isArray(srcProject.layers)) {
        for (const layer of srcProject.layers) {
          const layerEntry = { ...layer };
          const layerKey = `layer_${layer.id}`;
          if (dmdData.layerImages && dmdData.layerImages[layerKey] && dmdData.layerImages[layerKey].base64) {
            const lExt = extFromMime(dmdData.layerImages[layerKey].mimeType || 'image/png');
            const lFilename = `${layerKey}.${lExt}`;
            const lBuffer = Buffer.from(dmdData.layerImages[layerKey].base64, 'base64');
            await fsp.writeFile(path.join(pDir, lFilename), lBuffer);
            layerEntry.resultFilename = lFilename;
            layerEntry.resultMimeType = dmdData.layerImages[layerKey].mimeType || 'image/png';
          }
          layersData.push(layerEntry);
        }
      }

      // Restore ref images
      const refsData = [];
      if (Array.isArray(srcProject.entityRefs)) {
        for (let i = 0; i < srcProject.entityRefs.length; i++) {
          const ref = { ...srcProject.entityRefs[i] };
          const refKey = `ref_${i}`;
          if (dmdData.refImages && dmdData.refImages[refKey] && dmdData.refImages[refKey].base64) {
            const rExt = extFromMime(dmdData.refImages[refKey].mimeType || 'image/png');
            const rFilename = `${refKey}.${rExt}`;
            const rBuffer = Buffer.from(dmdData.refImages[refKey].base64, 'base64');
            await fsp.writeFile(path.join(pDir, rFilename), rBuffer);
            ref.filename = rFilename;
            ref.mimeType = dmdData.refImages[refKey].mimeType || 'image/png';
          }
          refsData.push(ref);
        }
      }

      // Build project.json
      const now = new Date().toISOString();
      const projectData = {
        id: projectId,
        name: srcProject.name || 'Imported Project',
        createdAt: now,
        updatedAt: now,
        sourceFilename,
        sourceMimeType: srcProject.sourceMimeType || 'image/png',
        modelKey: srcProject.modelKey || null,
        editPrompt: srcProject.editPrompt || null,
        aspectMode: srcProject.aspectMode || null,
        featherRadius: srcProject.featherRadius ?? null,
        resolution: srcProject.resolution || null,
        entityRefs: refsData,
        layers: layersData,
      };
      await saveJson(path.join(pDir, 'project.json'), projectData);

      // Generate thumbnail
      const sourcePath = path.join(pDir, sourceFilename);
      try {
        await fsp.access(sourcePath);
        await generateProjectThumbnail(pDir, sourcePath);
      } catch (e) {
        console.warn(`[projects] Import thumbnail failed for ${projectId}:`, e.message);
      }

      // Update projects-index.json
      const indexPath = userProjectsIndex(username);
      await ensureDir(userProjectsDir(username));
      const index = await loadJson(indexPath, []);
      index.push({
        id: projectId,
        name: projectData.name,
        updatedAt: now,
        layerCount: layersData.length,
        thumbFilename: 'thumb.jpg',
      });
      await saveJson(indexPath, index);

      console.log(`[projects] User "${username}" imported project "${projectData.name}" (${projectId})`);
      return res.json({ success: true, project: projectData });
    } catch (err) {
      console.error('[projects] Import error:', err);
      return res.status(500).json({ error: 'Failed to import project.' });
    }
  });

  // --- GET /api/projects --- List projects
  app.get('/api/projects', async (req, res) => {
    try {
      const { username } = req.session;
      const index = await loadJson(userProjectsIndex(username), []);
      const enriched = index.map(entry => ({
        ...entry,
        thumbUrl: `/api/projects/${entry.id}/thumb`,
      }));
      return res.json(enriched);
    } catch (err) {
      console.error('[projects] List error:', err);
      return res.status(500).json({ error: 'Failed to list projects.' });
    }
  });

  // --- GET /api/projects/:id --- Load project
  app.get('/api/projects/:id', async (req, res) => {
    try {
      const { username } = req.session;
      const { id } = req.params;

      if (!UUID_RE.test(id)) {
        return res.status(400).json({ error: 'Invalid project ID.' });
      }

      const pDir = projectDir(username, id);
      const projectPath = path.join(pDir, 'project.json');

      let projectData;
      try {
        projectData = await loadJson(projectPath, null);
      } catch {}

      if (!projectData) {
        return res.status(404).json({ error: 'Project not found.' });
      }

      // Enrich with URLs
      projectData.sourceUrl = `/api/projects/${id}/source`;

      if (Array.isArray(projectData.layers)) {
        projectData.layers = projectData.layers.map(layer => ({
          ...layer,
          resultUrl: layer.resultFilename ? `/api/projects/${id}/layer/${layer.id}` : null,
        }));
      }

      if (Array.isArray(projectData.entityRefs)) {
        projectData.entityRefs = projectData.entityRefs.map((ref, index) => ({
          ...ref,
          refUrl: ref.filename ? `/api/projects/${id}/ref/${index}` : null,
        }));
      }

      return res.json(projectData);
    } catch (err) {
      console.error('[projects] Load error:', err);
      return res.status(500).json({ error: 'Failed to load project.' });
    }
  });

  // --- PUT /api/projects/:id --- Update project
  app.put('/api/projects/:id', async (req, res) => {
    try {
      const { username } = req.session;
      const { id } = req.params;

      if (!UUID_RE.test(id)) {
        return res.status(400).json({ error: 'Invalid project ID.' });
      }

      const pDir = projectDir(username, id);
      const projectPath = path.join(pDir, 'project.json');

      const existing = await loadJson(projectPath, null);
      if (!existing) {
        return res.status(404).json({ error: 'Project not found.' });
      }

      const { name, modelKey, editPrompt, aspectMode, featherRadius, resolution, entityRefs, layers, sourceBase64, sourceMimeType } = req.body;
      const now = new Date().toISOString();

      // Update source if provided
      if (sourceBase64 && sourceMimeType) {
        const srcExt = extFromMime(sourceMimeType);
        const srcFilename = `source.${srcExt}`;
        const srcBuffer = Buffer.from(sourceBase64, 'base64');
        await fsp.writeFile(path.join(pDir, srcFilename), srcBuffer);
        existing.sourceFilename = srcFilename;
        existing.sourceMimeType = sourceMimeType;
      }

      // Update entity refs if provided
      if (Array.isArray(entityRefs)) {
        const refsData = [];
        for (let i = 0; i < entityRefs.length; i++) {
          const ref = entityRefs[i];
          if (ref.base64 && ref.mimeType) {
            const refExt = extFromMime(ref.mimeType);
            const refFilename = `ref_${i}.${refExt}`;
            const refBuffer = Buffer.from(ref.base64, 'base64');
            await fsp.writeFile(path.join(pDir, refFilename), refBuffer);
            refsData.push({ filename: refFilename, mimeType: ref.mimeType, name: ref.name || null, instruction: ref.instruction || null });
          } else {
            refsData.push({ filename: ref.filename || null, mimeType: ref.mimeType || null, name: ref.name || null, instruction: ref.instruction || null });
          }
        }
        existing.entityRefs = refsData;
      }

      // Update layers if provided
      if (Array.isArray(layers)) {
        const layersData = [];
        for (const layer of layers) {
          const layerEntry = { ...layer };
          delete layerEntry.resultBase64;
          delete layerEntry.resultMimeType;

          if (layer.resultBase64 && layer.resultMimeType) {
            const layerExt = extFromMime(layer.resultMimeType);
            const layerFilename = `layer_${layer.id}.${layerExt}`;
            const layerBuffer = Buffer.from(layer.resultBase64, 'base64');
            await fsp.writeFile(path.join(pDir, layerFilename), layerBuffer);
            layerEntry.resultFilename = layerFilename;
            layerEntry.resultMimeType = layer.resultMimeType;
          } else if (layer.resultFilename) {
            layerEntry.resultFilename = layer.resultFilename;
            layerEntry.resultMimeType = layer.resultMimeType || null;
          }
          layersData.push(layerEntry);
        }
        existing.layers = layersData;
      }

      if (name !== undefined) existing.name = name;
      if (modelKey !== undefined) existing.modelKey = modelKey;
      if (editPrompt !== undefined) existing.editPrompt = editPrompt;
      if (aspectMode !== undefined) existing.aspectMode = aspectMode;
      if (featherRadius !== undefined) existing.featherRadius = featherRadius;
      if (resolution !== undefined) existing.resolution = resolution;
      existing.updatedAt = now;

      await saveJson(projectPath, existing);

      // Regenerate thumbnail from source
      const sourcePath = path.join(pDir, existing.sourceFilename);
      try {
        await fsp.access(sourcePath);
        try { await fsp.unlink(path.join(pDir, 'thumb.jpg')); } catch {}
        await generateProjectThumbnail(pDir, sourcePath);
      } catch (e) {
        console.warn(`[projects] Thumbnail update failed for ${id}:`, e.message);
      }

      // Update projects-index.json
      const indexPath = userProjectsIndex(username);
      const index = await loadJson(indexPath, []);
      const indexEntry = index.find(e => e.id === id);
      if (indexEntry) {
        indexEntry.name = existing.name;
        indexEntry.updatedAt = now;
        indexEntry.layerCount = (existing.layers || []).length;
      }
      await saveJson(indexPath, index);

      console.log(`[projects] User "${username}" updated project ${id}`);
      return res.json({ success: true });
    } catch (err) {
      console.error('[projects] Update error:', err);
      return res.status(500).json({ error: 'Failed to update project.' });
    }
  });

  // --- DELETE /api/projects/:id --- Delete project
  app.delete('/api/projects/:id', async (req, res) => {
    try {
      const { username } = req.session;
      const { id } = req.params;

      if (!UUID_RE.test(id)) {
        return res.status(400).json({ error: 'Invalid project ID.' });
      }

      const pDir = projectDir(username, id);
      try {
        await fsp.rm(pDir, { recursive: true, force: true });
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }

      const indexPath = userProjectsIndex(username);
      const index = await loadJson(indexPath, []);
      const updated = index.filter(e => e.id !== id);
      await saveJson(indexPath, updated);

      console.log(`[projects] User "${username}" deleted project ${id}`);
      return res.json({ success: true });
    } catch (err) {
      console.error('[projects] Delete error:', err);
      return res.status(500).json({ error: 'Failed to delete project.' });
    }
  });

  // --- GET /api/projects/:id/source --- Serve source image
  app.get('/api/projects/:id/source', async (req, res) => {
    try {
      const { username } = req.session;
      const { id } = req.params;

      if (!UUID_RE.test(id)) {
        return res.status(400).json({ error: 'Invalid project ID.' });
      }

      const pDir = projectDir(username, id);
      const projectData = await loadJson(path.join(pDir, 'project.json'), null);
      if (!projectData) {
        return res.status(404).json({ error: 'Project not found.' });
      }

      const filePath = path.join(pDir, projectData.sourceFilename);
      try { await fsp.access(filePath); } catch {
        return res.status(404).json({ error: 'Source image file missing.' });
      }

      res.set({
        'Content-Type': projectData.sourceMimeType || 'image/png',
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      });

      const stream = fs.createReadStream(filePath);
      await pipeline(stream, res);
    } catch (err) {
      if (err.code !== 'ERR_HTTP_HEADERS_SENT') {
        console.error('[projects] Source serve error:', err);
      }
      if (!res.headersSent) {
        return res.status(500).json({ error: 'Failed to serve source image.' });
      }
    }
  });

  // --- GET /api/projects/:id/layer/:layerId --- Serve layer image
  app.get('/api/projects/:id/layer/:layerId', async (req, res) => {
    try {
      const { username } = req.session;
      const { id, layerId } = req.params;

      if (!UUID_RE.test(id)) {
        return res.status(400).json({ error: 'Invalid project ID.' });
      }

      const pDir = projectDir(username, id);
      const projectData = await loadJson(path.join(pDir, 'project.json'), null);
      if (!projectData) {
        return res.status(404).json({ error: 'Project not found.' });
      }

      const layer = (projectData.layers || []).find(l => l.id === layerId);
      if (!layer || !layer.resultFilename) {
        return res.status(404).json({ error: 'Layer image not found.' });
      }

      const filePath = path.join(pDir, layer.resultFilename);
      try { await fsp.access(filePath); } catch {
        return res.status(404).json({ error: 'Layer image file missing.' });
      }

      res.set({
        'Content-Type': layer.resultMimeType || mimeFromExt(layer.resultFilename),
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      });

      const stream = fs.createReadStream(filePath);
      await pipeline(stream, res);
    } catch (err) {
      if (err.code !== 'ERR_HTTP_HEADERS_SENT') {
        console.error('[projects] Layer serve error:', err);
      }
      if (!res.headersSent) {
        return res.status(500).json({ error: 'Failed to serve layer image.' });
      }
    }
  });

  // --- GET /api/projects/:id/ref/:index --- Serve reference image
  app.get('/api/projects/:id/ref/:index', async (req, res) => {
    try {
      const { username } = req.session;
      const { id } = req.params;
      const refIndex = parseInt(req.params.index, 10);

      if (!UUID_RE.test(id)) {
        return res.status(400).json({ error: 'Invalid project ID.' });
      }

      if (isNaN(refIndex) || refIndex < 0) {
        return res.status(400).json({ error: 'Invalid reference index.' });
      }

      const pDir = projectDir(username, id);
      const projectData = await loadJson(path.join(pDir, 'project.json'), null);
      if (!projectData) {
        return res.status(404).json({ error: 'Project not found.' });
      }

      const ref = (projectData.entityRefs || [])[refIndex];
      if (!ref || !ref.filename) {
        return res.status(404).json({ error: 'Reference image not found.' });
      }

      const filePath = path.join(pDir, ref.filename);
      try { await fsp.access(filePath); } catch {
        return res.status(404).json({ error: 'Reference image file missing.' });
      }

      res.set({
        'Content-Type': ref.mimeType || mimeFromExt(ref.filename),
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      });

      const stream = fs.createReadStream(filePath);
      await pipeline(stream, res);
    } catch (err) {
      if (err.code !== 'ERR_HTTP_HEADERS_SENT') {
        console.error('[projects] Ref serve error:', err);
      }
      if (!res.headersSent) {
        return res.status(500).json({ error: 'Failed to serve reference image.' });
      }
    }
  });

  // --- POST /api/projects/:id/layers/:layerId/image --- Upload layer image
  app.post('/api/projects/:id/layers/:layerId/image', async (req, res) => {
    try {
      const { username } = req.session;
      const { id, layerId } = req.params;

      if (!UUID_RE.test(id)) {
        return res.status(400).json({ error: 'Invalid project ID.' });
      }

      const { base64, mimeType } = req.body;
      if (!base64 || !mimeType) {
        return res.status(400).json({ error: 'base64 and mimeType are required.' });
      }

      const pDir = projectDir(username, id);
      const projectPath = path.join(pDir, 'project.json');
      const projectData = await loadJson(projectPath, null);
      if (!projectData) {
        return res.status(404).json({ error: 'Project not found.' });
      }

      const layer = (projectData.layers || []).find(l => l.id === layerId);
      if (!layer) {
        return res.status(404).json({ error: 'Layer not found.' });
      }

      // Save layer image
      const layerExt = extFromMime(mimeType);
      const layerFilename = `layer_${layerId}.${layerExt}`;
      const layerBuffer = Buffer.from(base64, 'base64');
      await fsp.writeFile(path.join(pDir, layerFilename), layerBuffer);

      // Update project.json
      layer.resultFilename = layerFilename;
      layer.resultMimeType = mimeType;
      projectData.updatedAt = new Date().toISOString();
      await saveJson(projectPath, projectData);

      console.log(`[projects] User "${username}" uploaded layer image ${layerFilename} for project ${id}`);
      return res.json({ success: true });
    } catch (err) {
      console.error('[projects] Layer upload error:', err);
      return res.status(500).json({ error: 'Failed to upload layer image.' });
    }
  });

  // --- GET /api/projects/:id/thumb --- Serve thumbnail
  app.get('/api/projects/:id/thumb', async (req, res) => {
    try {
      const { username } = req.session;
      const { id } = req.params;

      if (!UUID_RE.test(id)) {
        res.status(400).json({ error: 'Invalid project ID.' });
        return;
      }

      const pDir = projectDir(username, id);
      let thumbPath = path.join(pDir, 'thumb.jpg');

      try {
        await fsp.access(thumbPath);
      } catch {
        const projectData = await loadJson(path.join(pDir, 'project.json'), null);
        if (!projectData) {
          res.status(404).json({ error: 'Project not found.' });
          return;
        }
        const sourcePath = path.join(pDir, projectData.sourceFilename);
        try {
          await fsp.access(sourcePath);
          await generateProjectThumbnail(pDir, sourcePath);
        } catch {
          res.status(404).json({ error: 'Source image file missing.' });
          return;
        }
      }

      res.set({
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      });

      const stream = fs.createReadStream(thumbPath);
      await pipeline(stream, res);
    } catch (err) {
      if (err.code !== 'ERR_HTTP_HEADERS_SENT') {
        console.error('[projects] Thumb serve error:', err);
      }
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to serve thumbnail.' });
      }
    }
  });

  // --- GET /api/projects/:id/export --- Export .dmd file
  app.get('/api/projects/:id/export', async (req, res) => {
    try {
      const { username } = req.session;
      const { id } = req.params;

      if (!UUID_RE.test(id)) {
        return res.status(400).json({ error: 'Invalid project ID.' });
      }

      const pDir = projectDir(username, id);
      const projectData = await loadJson(path.join(pDir, 'project.json'), null);
      if (!projectData) {
        return res.status(404).json({ error: 'Project not found.' });
      }

      // Read source image base64
      let sourceBase64 = null;
      let sourceMimeType = projectData.sourceMimeType || 'image/png';
      if (projectData.sourceFilename) {
        try {
          const buffer = await fsp.readFile(path.join(pDir, projectData.sourceFilename));
          sourceBase64 = buffer.toString('base64');
        } catch {}
      }

      // Read layer images base64
      const layerImages = {};
      if (Array.isArray(projectData.layers)) {
        for (const layer of projectData.layers) {
          if (layer.resultFilename) {
            try {
              const buffer = await fsp.readFile(path.join(pDir, layer.resultFilename));
              layerImages[`layer_${layer.id}`] = {
                base64: buffer.toString('base64'),
                mimeType: layer.resultMimeType || 'image/png',
              };
            } catch {}
          }
        }
      }

      // Read ref images base64
      const refImages = {};
      if (Array.isArray(projectData.entityRefs)) {
        for (let i = 0; i < projectData.entityRefs.length; i++) {
          const ref = projectData.entityRefs[i];
          if (ref.filename) {
            try {
              const buffer = await fsp.readFile(path.join(pDir, ref.filename));
              refImages[`ref_${i}`] = {
                base64: buffer.toString('base64'),
                mimeType: ref.mimeType || 'image/png',
              };
            } catch {}
          }
        }
      }

      const exportData = {
        type: 'floui-stitcher-project',
        project: projectData,
        sourceImage: { base64: sourceBase64, mimeType: sourceMimeType },
        layerImages,
        refImages,
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${projectData.name || 'project'}.dmd"`);
      res.send(JSON.stringify(exportData, null, 2));
    } catch (err) {
      console.error('[projects] Export error:', err);
      return res.status(500).json({ error: 'Failed to export project.' });
    }
  });

  // Serve static assets in production
  if (fs.existsSync(DIST_DIR)) {
    app.use('/assets', express.static(path.join(DIST_DIR, 'assets')));
    app.use(express.static(DIST_DIR));
    app.get(/.*/, (_req, res) => {
      res.sendFile(path.join(DIST_DIR, 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`[server] Sticherr standalone server running on http://localhost:${PORT}`);
  });
}

start().catch(err => {
  console.error('[server] Boot failed:', err);
  process.exit(1);
});
