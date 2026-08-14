import { useState, useCallback, useRef, useEffect } from 'react';
import { usePersistedState, usePersistedImage, usePersistedImages } from '../../lib/usePersistedState';
import { Scissors, Undo2, RotateCcw, Save, Download, Eye, EyeOff, Trash2, ChevronUp, ChevronDown, RefreshCw, ImagePlus, X, FolderOpen, FileDown, Upload, CheckCircle, Loader2, MousePointer2, Move, FlipHorizontal, FlipVertical, ChevronRight, Paintbrush, Eraser, Undo, Redo, Circle, SunMedium, ZoomIn, ZoomOut, Maximize, Layers } from 'lucide-react';
import { ImageUpload, ErrorBanner, LoadingButton } from '../Shared';
import { stitcherEdit } from '../../lib/floyo';
import { resizeImage, downloadImage } from '../../lib/imageUtils';
import { MODELS, MODEL_DISPLAY } from '../../lib/constants';
import AdvancedSettings, { useAdvancedSettings, getAdvancedConfig } from './AdvancedSettings';
import MentionTextarea from './MentionTextarea';
import { useStitcherProject } from '../../lib/useStitcherProject';
import { getProjectSourceUrl, getProjectLayerUrl, getProjectRefUrl } from '../../lib/api';
import ProjectBrowser from './ProjectBrowser';

const HANDLE_SIZE = 8;
const MIN_SEL = 32;

// Create a feather mask canvas — opaque center, gradient-faded edges
// Uses direct ImageData alpha manipulation to avoid premultiplied-alpha
// precision loss that causes magenta/color shift artifacts.
function createFeatherMask(width, height, feather) {
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  const ctx = c.getContext('2d');
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Compute distance from each edge
      const distTop = y;
      const distBottom = height - 1 - y;
      const distLeft = x;
      const distRight = width - 1 - x;
      const minDist = Math.min(distTop, distBottom, distLeft, distRight);

      // Alpha: 0 at edge, 255 at feather distance inward
      let alpha = 255;
      if (minDist < feather) {
        alpha = Math.round((minDist / feather) * 255);
      }

      const idx = (y * width + x) * 4;
      data[idx] = 255;     // R
      data[idx + 1] = 255; // G
      data[idx + 2] = 255; // B
      data[idx + 3] = alpha;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return c;
}

// Composite a single layer's result onto a canvas context
async function compositeLayer(compCtx, layer, maskData) {
  if (!layer.visible || !layer.resultBase64) return;
  const resultImg = new Image();
  resultImg.src = `data:${layer.resultMimeType || 'image/png'};base64,${layer.resultBase64}`;
  await new Promise((resolve, reject) => { resultImg.onload = resolve; resultImg.onerror = reject; });

  const t = layer.transform || layer.selection;
  const crop = layer.cropInsets || { top: 0, right: 0, bottom: 0, left: 0 };

  // Source crop region from the generated result image
  const srcX = crop.left;
  const srcY = crop.top;
  const srcW = resultImg.naturalWidth - crop.left - crop.right;
  const srcH = resultImg.naturalHeight - crop.top - crop.bottom;

  // Destination (accounting for crop offset)
  const dstX = Math.round(t.x) + crop.left;
  const dstY = Math.round(t.y) + crop.top;
  const dstW = Math.round(t.width) - crop.left - crop.right;
  const dstH = Math.round(t.height) - crop.top - crop.bottom;

  if (dstW <= 0 || dstH <= 0 || srcW <= 0 || srcH <= 0) return;

  const prevAlpha = compCtx.globalAlpha;
  compCtx.globalAlpha = (layer.opacity ?? 100) / 100;

  const temp = document.createElement('canvas');
  temp.width = dstW; temp.height = dstH;
  const tCtx = temp.getContext('2d');

  // Apply flip
  if (layer.flipH || layer.flipV) {
    tCtx.save();
    tCtx.translate(layer.flipH ? dstW : 0, layer.flipV ? dstH : 0);
    tCtx.scale(layer.flipH ? -1 : 1, layer.flipV ? -1 : 1);
  }

  // Apply color adjustments via CSS filter
  const adj = layer.adjustments;
  if (adj && (adj.brightness !== 100 || adj.contrast !== 100 || adj.saturation !== 100)) {
    tCtx.filter = `brightness(${(adj.brightness || 100) / 100}) contrast(${(adj.contrast || 100) / 100}) saturate(${(adj.saturation || 100) / 100})`;
  }

  tCtx.drawImage(resultImg, srcX, srcY, srcW, srcH, 0, 0, dstW, dstH);
  tCtx.filter = 'none';

  if (layer.flipH || layer.flipV) tCtx.restore();

  // Apply feather mask
  if (layer.featherRadius > 0) {
    const mask = createFeatherMask(dstW, dstH, layer.featherRadius);
    tCtx.globalCompositeOperation = 'destination-in';
    tCtx.drawImage(mask, 0, 0);
  }

  // Apply per-layer mask (maskData is in source-image coordinates)
  if (maskData) {
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = dstW; maskCanvas.height = dstH;
    const mCtx = maskCanvas.getContext('2d');
    // Extract the mask region corresponding to this layer's destination
    const fullMaskCanvas = document.createElement('canvas');
    fullMaskCanvas.width = maskData.width; fullMaskCanvas.height = maskData.height;
    fullMaskCanvas.getContext('2d').putImageData(maskData, 0, 0);
    mCtx.drawImage(fullMaskCanvas, dstX, dstY, dstW, dstH, 0, 0, dstW, dstH);
    tCtx.globalCompositeOperation = 'destination-in';
    tCtx.drawImage(maskCanvas, 0, 0);
  }
  tCtx.globalCompositeOperation = 'source-over';

  compCtx.drawImage(temp, dstX, dstY);
  compCtx.globalAlpha = prevAlpha;
}

export default function StitcherSubTab({ apiKey, theme, apiProvider = 'floyo', onHistoryAdd, loadProjectId, onProjectLoaded: onProjectLoadedProp }) {
  // ── Persisted state ──
  const [modelKey, setModelKey] = usePersistedState('stitcher_model', 'standard');
  const [sourceImage, setSourceImage] = usePersistedImage('stitcher_source');
  const [editPrompt, setEditPrompt] = usePersistedState('stitcher_prompt', '');
  const [aspectMode, setAspectMode] = usePersistedState('stitcher_aspect', '1:1');
  const [featherRadius, setFeatherRadius] = usePersistedState('stitcher_feather', 12);
  const [resolution, setResolution] = usePersistedState('stitcher_resolution', 'auto');
  const [entityRefs, setEntityRefs] = usePersistedImages('stitcher_entityRefs');

  // ── Layer state ──
  // Each layer: { id, prompt, selection, transform, resultBase64, resultMimeType, featherRadius, opacity, cropInsets, flipH, flipV, visible }
  const [layers, setLayers] = useState([]);
  const [currentImage, setCurrentImage] = useState(null); // composited display image
  const [selection, setSelection] = useState(null);
  const [brushCursorPos, setBrushCursorPos] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [regenLayerId, setRegenLayerId] = useState(null); // which layer is regenerating
  const [showProjectBrowser, setShowProjectBrowser] = useState(false);
  const [canvasMode, setCanvasMode] = usePersistedState('stitcher_canvasMode', 'select');
  const [selectedLayerId, setSelectedLayerId] = useState(null);
  const [expandedLayerId, setExpandedLayerId] = useState(null);

  // ── Zoom & Pan state ──
  const [zoomLevel, setZoomLevel] = useState(1); // 1 = fit-to-container
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef(null);
  const panOffsetStartRef = useRef(null);
  const spaceHeldRef = useRef(false);

  // ── Paint state ──
  const [paintTool, setPaintTool] = usePersistedState('stitcher_paintTool', 'brush');
  const [brushSize, setBrushSize] = usePersistedState('stitcher_brushSize', 20);
  const [brushColor, setBrushColor] = usePersistedState('stitcher_brushColor', '#ffffff');
  const [brushOpacity, setBrushOpacity] = usePersistedState('stitcher_brushOpacity', 80);
  const [brushHardness, setBrushHardness] = usePersistedState('stitcher_brushHardness', 70);
  // Color adjust per-layer
  const [layerAdjustments, setLayerAdjustments] = useState({}); // { layerId: { brightness, contrast, saturation } }

  // ── Canvas refs ──
  const canvasRef = useRef(null);
  const paintCanvasRef = useRef(null);  // overlay canvas for paint strokes
  const containerRef = useRef(null);
  const scaleRef = useRef(1);
  const imgRef = useRef(null);
  const sourceImgRef = useRef(null);
  const isLoadingProjectRef = useRef(false);

  // ── Paint refs ──
  const paintDataRef = useRef(null);  // full-res ImageData for the paint overlay
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const isPaintingRef = useRef(false);
  const lastPaintPosRef = useRef(null);
  const [undoCount, setUndoCount] = useState(0); // triggers re-render for undo/redo button state
  const layerMasksRef = useRef({}); // { [layerId]: ImageData } - per-layer masks

  // ── Drag state ──
  const [dragMode, setDragMode] = useState(null);
  const dragStartRef = useRef(null);
  const selStartRef = useRef(null);

  const advanced = useAdvancedSettings();

  // ── Refs for project data snapshot (avoids stale closures) ──
  const layersRef = useRef(layers);
  const sourceImageRef2 = useRef(sourceImage);
  const entityRefsRef = useRef(entityRefs);
  useEffect(() => { layersRef.current = layers; }, [layers]);
  useEffect(() => { sourceImageRef2.current = sourceImage; }, [sourceImage]);
  useEffect(() => { entityRefsRef.current = entityRefs; }, [entityRefs]);

  // Project name ref — updated by useEffect after project hook is initialized
  const projectNameRef = useRef('Untitled Project');

  // ── Project management ──
  const getProjectData = useCallback(() => {
    // Convert paint overlay ImageData to base64 for persistence
    let paintOverlayBase64 = null;
    if (paintDataRef.current) {
      const pc = document.createElement('canvas');
      pc.width = paintDataRef.current.width;
      pc.height = paintDataRef.current.height;
      const pCtx = pc.getContext('2d');
      pCtx.putImageData(paintDataRef.current, 0, 0);
      // Only save if there's actually painted content
      const hasContent = paintDataRef.current.data.some((v, i) => i % 4 === 3 && v > 0);
      if (hasContent) paintOverlayBase64 = pc.toDataURL('image/png').split(',')[1];
    }
    // Convert layer masks to base64
    const layerMasks = {};
    for (const [id, mask] of Object.entries(layerMasksRef.current)) {
      const mc = document.createElement('canvas');
      mc.width = mask.width; mc.height = mask.height;
      mc.getContext('2d').putImageData(mask, 0, 0);
      layerMasks[id] = mc.toDataURL('image/png').split(',')[1];
    }
    return {
      name: projectNameRef.current,
      sourceImage: sourceImageRef2.current,
      modelKey, editPrompt, aspectMode, featherRadius, resolution,
      entityRefs: entityRefsRef.current,
      layers: layersRef.current,
      paintOverlayBase64,
      layerMasks: Object.keys(layerMasks).length > 0 ? layerMasks : null,
    };
  }, [modelKey, editPrompt, aspectMode, featherRadius, resolution]);

  const handleProjectLoaded = useCallback(async (data) => {
    isLoadingProjectRef.current = true;
    // Load source image from base64 (local DB) or URL
    if (data.sourceBase64) {
      setSourceImage({ base64: data.sourceBase64, mimeType: data.sourceMimeType || 'image/png' });
    } else if (data.sourceUrl) {
      try {
        const resp = await fetch(data.sourceUrl);
        const blob = await resp.blob();
        const reader = new FileReader();
        reader.onload = () => {
          const b64 = reader.result.split(',')[1];
          setSourceImage({ base64: b64, mimeType: blob.type || 'image/png' });
        };
        reader.readAsDataURL(blob);
      } catch (e) {
        console.error('[project] Failed to load source:', e);
      }
    }

    // Set settings
    if (data.modelKey) setModelKey(data.modelKey);
    if (data.editPrompt !== undefined) setEditPrompt(data.editPrompt);
    if (data.aspectMode) setAspectMode(data.aspectMode);
    if (data.featherRadius !== undefined) setFeatherRadius(data.featherRadius);
    if (data.resolution) setResolution(data.resolution);

    // Load entity refs from URLs
    if (data.entityRefs?.length > 0) {
      const loadedRefs = await Promise.all(data.entityRefs.map(async (ref, i) => {
        if (ref.refUrl) {
          try {
            const resp = await fetch(ref.refUrl);
            const blob = await resp.blob();
            const reader = new FileReader();
            const b64 = await new Promise(resolve => {
              reader.onload = () => resolve(reader.result.split(',')[1]);
              reader.readAsDataURL(blob);
            });
            return { base64: b64, mimeType: blob.type || ref.mimeType || 'image/png', name: ref.name || '', instruction: ref.instruction || '' };
          } catch { return null; }
        }
        return ref;
      }));
      setEntityRefs(loadedRefs.filter(Boolean));
    }

    // Load layers from URLs
    if (data.layers?.length > 0) {
      const loadedLayers = await Promise.all(data.layers.map(async (layer) => {
        let resultBase64 = layer.resultBase64;
        if (layer.resultUrl && !resultBase64) {
          try {
            const resp = await fetch(layer.resultUrl);
            const blob = await resp.blob();
            const reader = new FileReader();
            resultBase64 = await new Promise(resolve => {
              reader.onload = () => resolve(reader.result.split(',')[1]);
              reader.readAsDataURL(blob);
            });
          } catch { resultBase64 = null; }
        }
        return {
          ...layer,
          resultBase64,
          resultMimeType: layer.resultMimeType || 'image/png',
          opacity: layer.opacity ?? 100,
          transform: layer.transform || layer.selection,
          cropInsets: layer.cropInsets || { top: 0, right: 0, bottom: 0, left: 0 },
          flipH: layer.flipH || false,
          flipV: layer.flipV || false,
          adjustments: layer.adjustments || null,
        };
      }));
      setLayers(loadedLayers.filter(l => l.resultBase64));

      // Restore adjustments state
      const adjMap = {};
      loadedLayers.forEach(l => {
        if (l.adjustments) adjMap[l.id] = l.adjustments;
      });
      if (Object.keys(adjMap).length > 0) setLayerAdjustments(adjMap);
    }

    // Restore paint overlay
    if (data.paintOverlayBase64) {
      try {
        const pImg = new Image();
        pImg.src = `data:image/png;base64,${data.paintOverlayBase64}`;
        await new Promise((res, rej) => { pImg.onload = res; pImg.onerror = rej; });
        const pc = document.createElement('canvas');
        pc.width = pImg.naturalWidth; pc.height = pImg.naturalHeight;
        const pCtx = pc.getContext('2d');
        pCtx.drawImage(pImg, 0, 0);
        paintDataRef.current = pCtx.getImageData(0, 0, pc.width, pc.height);
      } catch (e) {
        console.warn('[project] Failed to load paint overlay:', e);
        paintDataRef.current = null;
      }
    } else {
      paintDataRef.current = null;
    }
    undoStackRef.current = [];
    redoStackRef.current = [];
    setUndoCount(0);

    // Restore layer masks
    layerMasksRef.current = {};
    if (data.layerMasks) {
      for (const [id, b64] of Object.entries(data.layerMasks)) {
        try {
          const mImg = new Image();
          mImg.src = `data:image/png;base64,${b64}`;
          await new Promise((res, rej) => { mImg.onload = res; mImg.onerror = rej; });
          const mc = document.createElement('canvas');
          mc.width = mImg.naturalWidth; mc.height = mImg.naturalHeight;
          const mCtx = mc.getContext('2d');
          mCtx.drawImage(mImg, 0, 0);
          layerMasksRef.current[id] = mCtx.getImageData(0, 0, mc.width, mc.height);
        } catch (e) {
          console.warn(`[project] Failed to load mask for layer ${id}:`, e);
        }
      }
    }

    onProjectLoadedProp?.();
  }, [setSourceImage, setModelKey, setEditPrompt, setAspectMode, setFeatherRadius, setResolution, setEntityRefs, onProjectLoadedProp]);

  const project = useStitcherProject({
    getProjectData,
    onProjectLoaded: handleProjectLoaded,
  });

  // Keep project name ref in sync for getProjectData closure
  useEffect(() => { projectNameRef.current = project.projectName; }, [project.projectName]);

  const [activeProjectId, setActiveProjectId] = usePersistedState('active_project_id', null);
  const [showMaskOverlay, setShowMaskOverlay] = usePersistedState('show_mask_overlay', true);

  // Auto-load last active project on mount (page refresh)
  useEffect(() => {
    if (activeProjectId && !loadProjectId) {
      project.loadProjectById(activeProjectId).catch(err => {
        console.warn('[project] Failed to auto-load active project:', err);
        setActiveProjectId(null);
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load project if ID was passed from outside (e.g. from history tab)
  useEffect(() => {
    if (loadProjectId) {
      project.loadProjectById(loadProjectId);
    }
  }, [loadProjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep active project ID in sync for persistence across page refreshes
  useEffect(() => {
    setActiveProjectId(project.projectId);
  }, [project.projectId, setActiveProjectId]);

  // Ctrl+S to save
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        project.saveProject().catch(() => {});
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [project.saveProject]);

  // ── Load source Image element ──
  useEffect(() => {
    if (!sourceImage) { sourceImgRef.current = null; setLayers([]); setSelection(null); setCurrentImage(null); setZoomLevel(1); setPanOffset({ x: 0, y: 0 }); return; }
    const img = new Image();
    img.onload = () => {
      sourceImgRef.current = img;
      if (!isLoadingProjectRef.current) {
        setLayers([]);
        setSelection(null);
        setZoomLevel(1);
        setPanOffset({ x: 0, y: 0 });
        recompose([]);
      } else {
        isLoadingProjectRef.current = false;
        recompose(layersRef.current);
      }
    };
    img.src = `data:${sourceImage.mimeType};base64,${sourceImage.base64}`;
  }, [sourceImage]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Recompose: build currentImage from source + visible layers + paint overlay ──
  const recompose = useCallback(async (layerList) => {
    const srcImg = sourceImgRef.current;
    if (!srcImg) return;
    const canvas = document.createElement('canvas');
    canvas.width = srcImg.naturalWidth;
    canvas.height = srcImg.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(srcImg, 0, 0);
    for (const layer of layerList) {
      await compositeLayer(ctx, layer, layerMasksRef.current[layer.id] || null);
    }
    // Draw paint overlay if present
    if (paintDataRef.current) {
      const paintCanvas = document.createElement('canvas');
      paintCanvas.width = srcImg.naturalWidth;
      paintCanvas.height = srcImg.naturalHeight;
      const pCtx = paintCanvas.getContext('2d');
      pCtx.putImageData(paintDataRef.current, 0, 0);
      ctx.drawImage(paintCanvas, 0, 0);
    }
    const b64 = canvas.toDataURL('image/png').split(',')[1];
    setCurrentImage({ base64: b64, mimeType: 'image/png' });
  }, []);

  // Recompose whenever layers change
  useEffect(() => {
    if (sourceImgRef.current && layers.length >= 0) {
      recompose(layers);
    }
  }, [layers, recompose]);

  // ── Paint helpers ──
  const initPaintCanvas = useCallback(() => {
    const src = sourceImgRef.current;
    if (!src) return;
    if (!paintDataRef.current || paintDataRef.current.width !== src.naturalWidth || paintDataRef.current.height !== src.naturalHeight) {
      paintDataRef.current = new ImageData(src.naturalWidth, src.naturalHeight);
    }
  }, []);

  const snapshotPaintState = useCallback(() => {
    const cloneData = (d) => d ? new ImageData(new Uint8ClampedArray(d.data), d.width, d.height) : null;
    const paintCopy = cloneData(paintDataRef.current);
    const masksCopy = {};
    for (const [id, mask] of Object.entries(layerMasksRef.current)) {
      masksCopy[id] = cloneData(mask);
    }
    return { paintData: paintCopy, masks: masksCopy };
  }, []);

  const restorePaintState = useCallback((snapshot) => {
    paintDataRef.current = snapshot.paintData;
    layerMasksRef.current = snapshot.masks || {};
  }, []);

  const pushPaintUndo = useCallback(() => {
    undoStackRef.current.push(snapshotPaintState());
    if (undoStackRef.current.length > 50) undoStackRef.current.shift();
    redoStackRef.current = [];
    setUndoCount(undoStackRef.current.length);
  }, [snapshotPaintState]);

  const paintUndo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    redoStackRef.current.push(snapshotPaintState());
    restorePaintState(undoStackRef.current.pop());
    setUndoCount(undoStackRef.current.length);
    recompose(layers);
  }, [layers, recompose, snapshotPaintState, restorePaintState]);

  const paintRedo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    undoStackRef.current.push(snapshotPaintState());
    restorePaintState(redoStackRef.current.pop());
    setUndoCount(undoStackRef.current.length);
    recompose(layers);
  }, [layers, recompose, snapshotPaintState, restorePaintState]);

  const clearPaintOverlay = useCallback(() => {
    pushPaintUndo();
    const src = sourceImgRef.current;
    if (src) paintDataRef.current = new ImageData(src.naturalWidth, src.naturalHeight);
    recompose(layers);
  }, [pushPaintUndo, layers, recompose]);

  // Initialize a layer mask if it doesn't exist (fully white = fully visible)
  const initLayerMask = useCallback((layerId) => {
    const src = sourceImgRef.current;
    if (!src || layerMasksRef.current[layerId]) return;
    const w = src.naturalWidth, h = src.naturalHeight;
    const mask = new ImageData(w, h);
    // Fill with white (fully visible)
    for (let i = 0; i < mask.data.length; i += 4) {
      mask.data[i] = 255; mask.data[i + 1] = 255; mask.data[i + 2] = 255; mask.data[i + 3] = 255;
    }
    layerMasksRef.current[layerId] = mask;
  }, []);

  // Draw a brush/eraser/mask/unmask dot at (imgX, imgY) in image coordinates
  const paintDot = useCallback((imgX, imgY) => {
    const isMaskTool = paintTool === 'mask' || paintTool === 'unmask';

    // Determine which ImageData to paint on
    let targetData;
    if (isMaskTool) {
      if (!selectedLayerId || !layerMasksRef.current[selectedLayerId]) return;
      targetData = layerMasksRef.current[selectedLayerId];
    } else {
      if (!paintDataRef.current) return;
      targetData = paintDataRef.current;
    }

    const data = targetData.data;
    const w = targetData.width;
    const h = targetData.height;
    const radius = brushSize / 2;
    const hardness = brushHardness / 100;
    const alpha = (brushOpacity / 100) * 255;

    // Parse brush color (only for brush tool)
    let r = 255, g = 255, b = 255;
    if (paintTool === 'brush') {
      const hex = brushColor.replace('#', '');
      r = parseInt(hex.substring(0, 2), 16);
      g = parseInt(hex.substring(2, 4), 16);
      b = parseInt(hex.substring(4, 6), 16);
    }

    const x0 = Math.max(0, Math.floor(imgX - radius));
    const y0 = Math.max(0, Math.floor(imgY - radius));
    const x1 = Math.min(w - 1, Math.ceil(imgX + radius));
    const y1 = Math.min(h - 1, Math.ceil(imgY + radius));

    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const dist = Math.sqrt((px - imgX) ** 2 + (py - imgY) ** 2);
        if (dist > radius) continue;

        // Compute hardness falloff
        const normalizedDist = dist / radius;
        const falloff = normalizedDist <= hardness ? 1 : Math.max(0, 1 - (normalizedDist - hardness) / (1 - hardness + 0.001));
        const dotAlpha = alpha * falloff;

        const idx = (py * w + px) * 4;

        if (paintTool === 'mask') {
          // Mask: reduce alpha (hide layer at this point)
          data[idx + 3] = Math.max(0, data[idx + 3] - dotAlpha);
        } else if (paintTool === 'unmask') {
          // Unmask: restore alpha (reveal layer at this point)
          data[idx + 3] = Math.min(255, data[idx + 3] + dotAlpha);
        } else if (paintTool === 'eraser') {
          // Eraser: reduce alpha on paint overlay
          data[idx + 3] = Math.max(0, data[idx + 3] - dotAlpha);
        } else {
          // Brush: blend color on paint overlay
          const existingA = data[idx + 3] / 255;
          const newA = dotAlpha / 255;
          const outA = newA + existingA * (1 - newA);
          if (outA > 0) {
            data[idx]     = Math.round((r * newA + data[idx]     * existingA * (1 - newA)) / outA);
            data[idx + 1] = Math.round((g * newA + data[idx + 1] * existingA * (1 - newA)) / outA);
            data[idx + 2] = Math.round((b * newA + data[idx + 2] * existingA * (1 - newA)) / outA);
            data[idx + 3] = Math.round(outA * 255);
          }
        }
      }
    }
  }, [brushSize, brushHardness, brushOpacity, brushColor, paintTool, selectedLayerId]);

  // Interpolate dots between two points
  const paintLine = useCallback((x0, y0, x1, y1) => {
    const dist = Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2);
    const step = Math.max(1, brushSize / 6);
    const steps = Math.ceil(dist / step);
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps;
      paintDot(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
    }
  }, [paintDot, brushSize]);

  // Draw paint overlay onto the visible display canvas for real-time feedback
  const syncPaintToDisplay = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !paintDataRef.current) return;
    const ctx = canvas.getContext('2d');
    const s = scaleRef.current;
    // Redraw base
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    // Draw scaled paint overlay
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = paintDataRef.current.width;
    tempCanvas.height = paintDataRef.current.height;
    const tCtx = tempCanvas.getContext('2d');
    tCtx.putImageData(paintDataRef.current, 0, 0);
    ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
  }, []);

  // ── Layer controls (must be defined before pointer handlers / keyboard effects) ──
  const toggleLayer = useCallback((id) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, visible: !l.visible } : l));
    project.markDirty();
  }, [project.markDirty]);

  const deleteLayer = useCallback((id) => {
    setLayers(prev => prev.filter(l => l.id !== id));
    project.markDirty();
  }, [project.markDirty]);

  const moveLayer = useCallback((id, dir) => {
    setLayers(prev => {
      const idx = prev.findIndex(l => l.id === id);
      if (idx < 0) return prev;
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return arr;
    });
    project.markDirty();
  }, [project.markDirty]);

  const updateLayerFeather = useCallback((id, val) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, featherRadius: val } : l));
    project.markDirty();
  }, [project.markDirty]);

  const updateLayerOpacity = useCallback((id, val) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, opacity: val } : l));
    project.markDirty();
  }, [project.markDirty]);

  const updateLayerTransform = useCallback((id, transform) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, transform } : l));
    project.markDirty();
  }, [project.markDirty]);

  const updateLayerCrop = useCallback((id, cropInsets) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, cropInsets } : l));
    project.markDirty();
  }, [project.markDirty]);

  const toggleLayerFlipH = useCallback((id) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, flipH: !l.flipH } : l));
    project.markDirty();
  }, [project.markDirty]);

  const toggleLayerFlipV = useCallback((id) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, flipV: !l.flipV } : l));
    project.markDirty();
  }, [project.markDirty]);

  const resetLayerTransform = useCallback((id) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, transform: { ...l.selection }, cropInsets: { top: 0, right: 0, bottom: 0, left: 0 }, flipH: false, flipV: false, opacity: 100 } : l));
    project.markDirty();
  }, [project.markDirty]);

  // ── Load display Image element for canvas rendering ──
  useEffect(() => {
    if (!currentImage) { imgRef.current = null; return; }
    const img = new Image();
    img.onload = () => { imgRef.current = img; fitCanvas(); };
    img.src = `data:${currentImage.mimeType};base64,${currentImage.base64}`;
  }, [currentImage]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fit canvas ──
  const baseScaleRef = useRef(1);
  const fitCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const img = imgRef.current;
    if (!canvas || !container || !img) return;

    const availableWidth = container.clientWidth - 40;
    const availableHeight = container.clientHeight - (canvasMode === 'paint' ? 180 : 150);
    const baseScale = Math.min(availableWidth / img.naturalWidth, availableHeight / img.naturalHeight, 1);

    baseScaleRef.current = baseScale;
    const scale = baseScale * zoomLevel;
    scaleRef.current = scale;
    canvas.width = Math.floor(img.naturalWidth * scale);
    canvas.height = Math.floor(img.naturalHeight * scale);
    redraw();
  }, [zoomLevel, canvasMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => fitCanvas());
    ro.observe(container);
    return () => ro.disconnect();
  }, [fitCanvas]);

  // ── Redraw canvas ──
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    const s = scaleRef.current;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    if (canvasMode === 'select' && selection) {
      // Selection rectangle
      const sx = selection.x * s, sy = selection.y * s;
      const sw = selection.width * s, sh = selection.height * s;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.clearRect(sx, sy, sw, sh);
      ctx.drawImage(img, selection.x, selection.y, selection.width, selection.height, sx, sy, sw, sh);
      ctx.setLineDash([6, 4]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.strokeRect(sx, sy, sw, sh); ctx.setLineDash([]);
      ctx.fillStyle = '#FFEB28';
      const hs = HANDLE_SIZE;
      for (const [cx, cy] of [[sx - hs/2, sy - hs/2], [sx+sw - hs/2, sy - hs/2], [sx - hs/2, sy+sh - hs/2], [sx+sw - hs/2, sy+sh - hs/2]]) {
        ctx.fillRect(cx, cy, hs, hs);
      }
      const dimText = `${Math.round(selection.width)} × ${Math.round(selection.height)}`;
      ctx.font = '11px Inter, system-ui, sans-serif';
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      const tm = ctx.measureText(dimText);
      const lx = sx + sw/2 - tm.width/2 - 6, ly = sy - 20;
      ctx.fillRect(lx, ly, tm.width + 12, 18);
      ctx.fillStyle = '#fff';
      ctx.fillText(dimText, lx + 6, ly + 13);
    }

    if (canvasMode === 'transform') {
      // Draw subtle outlines for all visible layers
      for (const layer of layers) {
        if (!layer.visible || !layer.resultBase64) continue;
        const t = layer.transform || layer.selection;
        const lx = t.x * s, ly = t.y * s, lw = t.width * s, lh = t.height * s;
        if (layer.id === selectedLayerId) {
          // Selected layer: blue dashed outline + handles
          ctx.setLineDash([6, 3]); ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2;
          ctx.strokeRect(lx, ly, lw, lh); ctx.setLineDash([]);
          ctx.fillStyle = '#3b82f6';
          const hs = HANDLE_SIZE;
          for (const [cx, cy] of [[lx - hs/2, ly - hs/2], [lx+lw - hs/2, ly - hs/2], [lx - hs/2, ly+lh - hs/2], [lx+lw - hs/2, ly+lh - hs/2]]) {
            ctx.fillRect(cx, cy, hs, hs);
          }
          // Dimension label
          const dimText = `${Math.round(t.width)} × ${Math.round(t.height)}`;
          ctx.font = '11px Inter, system-ui, sans-serif';
          ctx.fillStyle = 'rgba(59,130,246,0.85)';
          const tm = ctx.measureText(dimText);
          const dlx = lx + lw/2 - tm.width/2 - 6, dly = ly - 22;
          ctx.beginPath(); ctx.roundRect(dlx, dly, tm.width + 12, 18, 4); ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.fillText(dimText, dlx + 6, dly + 13);
        } else {
          // Other layers: subtle dotted outline
          ctx.setLineDash([3, 5]); ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1;
          ctx.strokeRect(lx, ly, lw, lh); ctx.setLineDash([]);
        }
      }
    }

    // Mask visualization: show red tint on masked (hidden) areas when mask/unmask tools active
    if (canvasMode === 'paint' && (paintTool === 'mask' || paintTool === 'unmask') && selectedLayerId && showMaskOverlay) {
      const maskData = layerMasksRef.current[selectedLayerId];
      if (maskData) {
        const overlayCanvas = document.createElement('canvas');
        overlayCanvas.width = maskData.width;
        overlayCanvas.height = maskData.height;
        const oCtx = overlayCanvas.getContext('2d');
        const overlay = oCtx.createImageData(maskData.width, maskData.height);
        for (let i = 0; i < maskData.data.length; i += 4) {
          const maskAlpha = maskData.data[i + 3];
          if (maskAlpha < 255) {
            // Show red where mask is hiding the layer
            overlay.data[i] = 255;     // R
            overlay.data[i + 1] = 50;  // G
            overlay.data[i + 2] = 50;  // B
            overlay.data[i + 3] = Math.round((255 - maskAlpha) * 0.4); // intensity based on how much is masked
          }
        }
        oCtx.putImageData(overlay, 0, 0);
        ctx.drawImage(overlayCanvas, 0, 0, canvas.width, canvas.height);
      }
    }

    // Brush size preview cursor outline (crosshair cursor replacement)
    if (canvasMode === 'paint' && brushCursorPos) {
      const radius = (brushSize / 2) * scaleRef.current;
      ctx.save();
      ctx.beginPath();
      ctx.arc(brushCursorPos.x, brushCursorPos.y, radius, 0, Math.PI * 2);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = 3;
      ctx.stroke();
      ctx.restore();
    }
  }, [selection, canvasMode, selectedLayerId, layers, paintTool, brushCursorPos, brushSize, showMaskOverlay]);

  useEffect(() => { redraw(); }, [redraw]);

  // ── Coordinate helpers ──
  const canvasToImage = useCallback((cx, cy) => ({ x: cx / scaleRef.current, y: cy / scaleRef.current }), []);
  const getCanvasPos = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return e.touches
      ? { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top }
      : { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY };
  }, []);

  // ── Zoom helpers ──
  const handleZoomIn = useCallback(() => {
    setZoomLevel(prev => Math.min(prev * 1.25, 8));
  }, []);
  const handleZoomOut = useCallback(() => {
    setZoomLevel(prev => Math.max(prev / 1.25, 0.25));
  }, []);
  const handleZoomFit = useCallback(() => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  }, []);

  // ── Wheel zoom handler ──
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleNativeWheel = (e) => {
      e.preventDefault();
      const delta = -e.deltaY;
      const factor = delta > 0 ? 1.08 : 1 / 1.08;
      setZoomLevel(prev => Math.min(Math.max(prev * factor, 0.25), 8));
    };

    container.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleNativeWheel);
    };
  }, []);

  // ── Pan handlers (middle-click or space+drag) ──
  const handlePanStart = useCallback((e) => {
    // Middle mouse button or space held
    if (e.button === 1 || spaceHeldRef.current) {
      if (e.cancelable) e.preventDefault();
      isPanningRef.current = true;
      panStartRef.current = { x: e.clientX, y: e.clientY };
      panOffsetStartRef.current = { ...panOffset };
    }
  }, [panOffset]);

  const handlePanMove = useCallback((e) => {
    if (!isPanningRef.current || !panStartRef.current) return;
    if (e.cancelable) e.preventDefault();
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    setPanOffset({
      x: panOffsetStartRef.current.x + dx,
      y: panOffsetStartRef.current.y + dy,
    });
  }, []);

  const handlePanEnd = useCallback(() => {
    isPanningRef.current = false;
    panStartRef.current = null;
    panOffsetStartRef.current = null;
  }, []);

  // ── Space key for pan mode ──
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space' && !e.repeat && e.target === document.body) {
        e.preventDefault();
        spaceHeldRef.current = true;
      }
    };
    const handleKeyUp = (e) => {
      if (e.code === 'Space') {
        spaceHeldRef.current = false;
        if (isPanningRef.current) {
          isPanningRef.current = false;
          panStartRef.current = null;
          panOffsetStartRef.current = null;
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // ── Hit-test helpers (selection mode) ──
  const hitCorner = useCallback((pos) => {
    if (!selection) return null;
    const s = scaleRef.current;
    const sx = selection.x*s, sy = selection.y*s, sw = selection.width*s, sh = selection.height*s;
    const r = HANDLE_SIZE + 4;
    for (const c of [{ x: sx, y: sy, id: 'resize-tl' }, { x: sx+sw, y: sy, id: 'resize-tr' }, { x: sx, y: sy+sh, id: 'resize-bl' }, { x: sx+sw, y: sy+sh, id: 'resize-br' }]) {
      if (Math.abs(pos.x - c.x) < r && Math.abs(pos.y - c.y) < r) return c.id;
    }
    return null;
  }, [selection]);

  const hitInside = useCallback((pos) => {
    if (!selection) return false;
    const s = scaleRef.current;
    const sx = selection.x*s, sy = selection.y*s, sw = selection.width*s, sh = selection.height*s;
    return pos.x >= sx && pos.x <= sx+sw && pos.y >= sy && pos.y <= sy+sh;
  }, [selection]);

  // ── Hit-test helpers (transform mode) ──
  const hitLayerCorner = useCallback((pos) => {
    if (!selectedLayerId) return null;
    const layer = layers.find(l => l.id === selectedLayerId);
    if (!layer) return null;
    const s = scaleRef.current;
    const t = layer.transform || layer.selection;
    const lx = t.x*s, ly = t.y*s, lw = t.width*s, lh = t.height*s;
    const r = HANDLE_SIZE + 4;
    for (const c of [{ x: lx, y: ly, id: 'tl' }, { x: lx+lw, y: ly, id: 'tr' }, { x: lx, y: ly+lh, id: 'bl' }, { x: lx+lw, y: ly+lh, id: 'br' }]) {
      if (Math.abs(pos.x - c.x) < r && Math.abs(pos.y - c.y) < r) return c.id;
    }
    return null;
  }, [selectedLayerId, layers]);

  const hitLayer = useCallback((pos) => {
    // Hit-test layers top-to-bottom (reverse order = topmost first)
    const s = scaleRef.current;
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      if (!layer.visible || !layer.resultBase64) continue;
      const t = layer.transform || layer.selection;
      const lx = t.x*s, ly = t.y*s, lw = t.width*s, lh = t.height*s;
      if (pos.x >= lx && pos.x <= lx+lw && pos.y >= ly && pos.y <= ly+lh) return layer.id;
    }
    return null;
  }, [layers]);

  const constrain = useCallback((w, h) => {
    const ratio = aspectMode === '16:9' ? 16/9 : 1;
    return w/h > ratio ? { w, h: w/ratio } : { w: h*ratio, h };
  }, [aspectMode]);

  // ── Pointer handlers ──
  const handlePointerDown = useCallback((e) => {
    if (e.cancelable) e.preventDefault();
    // Pan mode check (space+click or middle button)
    if (e.button === 1 || spaceHeldRef.current) {
      handlePanStart(e);
      return;
    }
    const pos = getCanvasPos(e);
    if (!imgRef.current) return;

    if (canvasMode === 'select') {
      // Original selection behavior
      const corner = hitCorner(pos);
      if (corner) { setDragMode(corner); dragStartRef.current = pos; selStartRef.current = { ...selection }; return; }
      if (hitInside(pos)) { setDragMode('move'); dragStartRef.current = pos; selStartRef.current = { ...selection }; return; }
      setDragMode('draw'); dragStartRef.current = canvasToImage(pos.x, pos.y); setSelection(null);
    } else if (canvasMode === 'paint') {
      // Paint mode
      const isMaskTool = paintTool === 'mask' || paintTool === 'unmask';
      if (isMaskTool) {
        if (!selectedLayerId) return; // Need a layer selected for mask tools
        initLayerMask(selectedLayerId);
      } else {
        initPaintCanvas();
      }
      pushPaintUndo();
      const imgPos = canvasToImage(pos.x, pos.y);
      paintDot(imgPos.x, imgPos.y);
      lastPaintPosRef.current = imgPos;
      isPaintingRef.current = true;
      syncPaintToDisplay();
    } else {
      // Transform mode
      const corner = hitLayerCorner(pos);
      if (corner) {
        const layer = layers.find(l => l.id === selectedLayerId);
        if (layer) {
          setDragMode('layer-resize-' + corner);
          dragStartRef.current = pos;
          selStartRef.current = { ...layer.transform || layer.selection };
        }
        return;
      }
      const hitId = hitLayer(pos);
      if (hitId) {
        setSelectedLayerId(hitId);
        if (hitId === selectedLayerId) {
          const layer = layers.find(l => l.id === hitId);
          if (layer) {
            setDragMode('layer-move');
            dragStartRef.current = pos;
            selStartRef.current = { ...layer.transform || layer.selection };
          }
        }
      } else {
        setSelectedLayerId(null);
      }
    }
  }, [getCanvasPos, hitCorner, hitInside, selection, canvasToImage, canvasMode, hitLayerCorner, hitLayer, selectedLayerId, layers, initPaintCanvas, pushPaintUndo, paintDot, syncPaintToDisplay, initLayerMask, paintTool, handlePanStart]);

  const handlePointerMove = useCallback((e) => {
    if (e.cancelable) e.preventDefault();

    // Track pointer location for brush cursor preview in paint mode
    if (canvasMode === 'paint') {
      const pos = getCanvasPos(e);
      setBrushCursorPos(pos);
    } else {
      setBrushCursorPos(null);
    }

    // Pan mode movement
    if (isPanningRef.current) { handlePanMove(e); return; }
    if (!dragMode && !(canvasMode === 'paint' && isPaintingRef.current)) return;
    const pos = getCanvasPos(e);
    const img = imgRef.current;
    if (!img) return;
    const iw = img.naturalWidth, ih = img.naturalHeight;

    if (canvasMode === 'select') {
      // Original selection behavior
      if (dragMode === 'draw') {
        const imgPos = canvasToImage(pos.x, pos.y);
        const start = dragStartRef.current;
        let w = Math.abs(imgPos.x - start.x), h = Math.abs(imgPos.y - start.y);
        if (w < MIN_SEL && h < MIN_SEL) return;
        const c = constrain(w, h); w = c.w; h = c.h;
        let x = Math.min(start.x, imgPos.x), y = Math.min(start.y, imgPos.y);
        if (imgPos.x < start.x) x = start.x - w;
        if (imgPos.y < start.y) y = start.y - h;
        x = Math.max(0, Math.min(x, iw - w)); y = Math.max(0, Math.min(y, ih - h));
        setSelection({ x, y, width: Math.min(w, iw), height: Math.min(h, ih) });
      } else if (dragMode === 'move') {
        const s = scaleRef.current;
        const sel = selStartRef.current;
        let x = sel.x + (pos.x - dragStartRef.current.x)/s;
        let y = sel.y + (pos.y - dragStartRef.current.y)/s;
        x = Math.max(0, Math.min(x, iw - sel.width)); y = Math.max(0, Math.min(y, ih - sel.height));
        setSelection({ x, y, width: sel.width, height: sel.height });
      } else if (dragMode.startsWith('resize-')) {
        const s = scaleRef.current, sel = selStartRef.current;
        const dx = (pos.x - dragStartRef.current.x)/s, dy = (pos.y - dragStartRef.current.y)/s;
        let nx = sel.x, ny = sel.y, nw = sel.width, nh = sel.height;
        if (dragMode === 'resize-br') nw = Math.max(MIN_SEL, sel.width + dx);
        else if (dragMode === 'resize-bl') { nw = Math.max(MIN_SEL, sel.width - dx); nx = sel.x + sel.width - nw; }
        else if (dragMode === 'resize-tr') { nw = Math.max(MIN_SEL, sel.width + dx); nh = Math.max(MIN_SEL, sel.height - dy); ny = sel.y + sel.height - nh; }
        else if (dragMode === 'resize-tl') { nw = Math.max(MIN_SEL, sel.width - dx); nh = Math.max(MIN_SEL, sel.height - dy); nx = sel.x + sel.width - nw; ny = sel.y + sel.height - nh; }
        const c = constrain(nw, nh); nw = c.w; nh = c.h;
        nx = Math.max(0, Math.min(nx, iw - nw)); ny = Math.max(0, Math.min(ny, ih - nh));
        setSelection({ x: nx, y: ny, width: nw, height: nh });
      }
    } else if (canvasMode === 'paint') {
      // Paint mode
      if (isPaintingRef.current) {
        const imgPos = canvasToImage(pos.x, pos.y);
        const last = lastPaintPosRef.current;
        if (last) paintLine(last.x, last.y, imgPos.x, imgPos.y);
        else paintDot(imgPos.x, imgPos.y);
        lastPaintPosRef.current = imgPos;
        const isMaskTool = paintTool === 'mask' || paintTool === 'unmask';
        if (isMaskTool) {
          redraw(); // Shows red mask overlay in real-time
        } else {
          syncPaintToDisplay();
        }
      }
    } else {
      // Transform mode
      if (dragMode === 'layer-move' && selectedLayerId) {
        const s = scaleRef.current;
        const orig = selStartRef.current;
        let x = orig.x + (pos.x - dragStartRef.current.x)/s;
        let y = orig.y + (pos.y - dragStartRef.current.y)/s;
        x = Math.max(0, Math.min(x, iw - orig.width)); y = Math.max(0, Math.min(y, ih - orig.height));
        updateLayerTransform(selectedLayerId, { x, y, width: orig.width, height: orig.height });
      } else if (dragMode.startsWith('layer-resize-') && selectedLayerId) {
        const s = scaleRef.current, orig = selStartRef.current;
        const dx = (pos.x - dragStartRef.current.x)/s, dy = (pos.y - dragStartRef.current.y)/s;
        const corner = dragMode.replace('layer-resize-', '');
        let nx = orig.x, ny = orig.y, nw = orig.width, nh = orig.height;
        if (corner === 'br') { nw = Math.max(MIN_SEL, orig.width + dx); nh = Math.max(MIN_SEL, orig.height + dy); }
        else if (corner === 'bl') { nw = Math.max(MIN_SEL, orig.width - dx); nh = Math.max(MIN_SEL, orig.height + dy); nx = orig.x + orig.width - nw; }
        else if (corner === 'tr') { nw = Math.max(MIN_SEL, orig.width + dx); nh = Math.max(MIN_SEL, orig.height - dy); ny = orig.y + orig.height - nh; }
        else if (corner === 'tl') { nw = Math.max(MIN_SEL, orig.width - dx); nh = Math.max(MIN_SEL, orig.height - dy); nx = orig.x + orig.width - nw; ny = orig.y + orig.height - nh; }
        nx = Math.max(0, Math.min(nx, iw - nw)); ny = Math.max(0, Math.min(ny, ih - nh));
        updateLayerTransform(selectedLayerId, { x: nx, y: ny, width: nw, height: nh });
      }
    }
  }, [dragMode, getCanvasPos, canvasToImage, constrain, canvasMode, selectedLayerId, updateLayerTransform, paintLine, paintDot, syncPaintToDisplay, redraw, paintTool, handlePanMove]);

  const handlePointerUp = useCallback(() => {
    // End pan if active
    if (isPanningRef.current) { handlePanEnd(); return; }
    if (canvasMode === 'paint' && isPaintingRef.current) {
      isPaintingRef.current = false;
      lastPaintPosRef.current = null;
      recompose(layers); // Full recompose after painting
      project.markDirty();
    }
    setDragMode(null); dragStartRef.current = null; selStartRef.current = null;
  }, [canvasMode, layers, recompose, project.markDirty, handlePanEnd]);

  const getCursor = useCallback((e) => {
    // Pan mode cursor
    if (isPanningRef.current) return 'grabbing';
    if (spaceHeldRef.current) return 'grab';
    if (canvasMode === 'select') {
      if (dragMode === 'draw') return 'crosshair';
      if (dragMode === 'move') return 'move';
      if (dragMode?.startsWith('resize-')) return dragMode.includes('tl') || dragMode.includes('br') ? 'nwse-resize' : 'nesw-resize';
      const pos = getCanvasPos(e);
      const corner = hitCorner(pos);
      if (corner) return corner.includes('tl') || corner.includes('br') ? 'nwse-resize' : 'nesw-resize';
      if (hitInside(pos)) return 'move';
      return 'crosshair';
    } else if (canvasMode === 'paint') {
      return 'crosshair';
    } else {
      if (dragMode === 'layer-move') return 'move';
      if (dragMode?.startsWith('layer-resize-')) {
        const c = dragMode.replace('layer-resize-', '');
        return (c === 'tl' || c === 'br') ? 'nwse-resize' : 'nesw-resize';
      }
      const pos = getCanvasPos(e);
      const corner = hitLayerCorner(pos);
      if (corner) return (corner === 'tl' || corner === 'br') ? 'nwse-resize' : 'nesw-resize';
      if (hitLayer(pos)) return 'move';
      return 'default';
    }
  }, [dragMode, getCanvasPos, hitCorner, hitInside, canvasMode, hitLayerCorner, hitLayer]);

  // ── Transform mode keyboard shortcuts ──
  useEffect(() => {
    if (canvasMode !== 'transform' || !selectedLayerId) return;
    const handler = (e) => {
      const step = e.shiftKey ? 10 : 1;
      const layer = layers.find(l => l.id === selectedLayerId);
      if (!layer) return;
      const t = layer.transform || layer.selection;
      if (e.key === 'ArrowLeft') { e.preventDefault(); updateLayerTransform(selectedLayerId, { ...t, x: Math.max(0, t.x - step) }); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); updateLayerTransform(selectedLayerId, { ...t, x: t.x + step }); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); updateLayerTransform(selectedLayerId, { ...t, y: Math.max(0, t.y - step) }); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); updateLayerTransform(selectedLayerId, { ...t, y: t.y + step }); }
      else if (e.key === 'Delete') { e.preventDefault(); deleteLayer(selectedLayerId); setSelectedLayerId(null); }
      else if (e.key === 'Escape') { setSelectedLayerId(null); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [canvasMode, selectedLayerId, layers, updateLayerTransform, deleteLayer]);

  // ── Paint mode keyboard shortcuts (Ctrl+Z / Ctrl+Y) ──
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault(); paintUndo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault(); paintRedo();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [paintUndo, paintRedo]);

  // ── Generate ──
  const canGenerate = !!selection && !!editPrompt.trim() && !!apiKey && !!currentImage;

  const handleGenerate = useCallback(async () => {
    if (!canGenerate || !selection) return;
    setLoading(true); setError('');
    try {
      const srcImg = sourceImgRef.current;
      if (!srcImg) throw new Error('Image not loaded');

      // Ensure integer coordinates for crop to prevent sub-pixel shifting/blurring
      const roundedSelection = {
        x: Math.round(selection.x),
        y: Math.round(selection.y),
        width: Math.round(selection.width),
        height: Math.round(selection.height),
      };

      // Recompose up to current visible layers to get the "current state" to crop from
      const compCanvas = document.createElement('canvas');
      compCanvas.width = srcImg.naturalWidth; compCanvas.height = srcImg.naturalHeight;
      const compCtx = compCanvas.getContext('2d');
      compCtx.drawImage(srcImg, 0, 0);
      for (const l of layers) { await compositeLayer(compCtx, l); }

      // Crop selection from current composite
      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = roundedSelection.width; cropCanvas.height = roundedSelection.height;
      const cropCtx = cropCanvas.getContext('2d');
      cropCtx.drawImage(compCanvas, roundedSelection.x, roundedSelection.y, roundedSelection.width, roundedSelection.height, 0, 0, cropCanvas.width, cropCanvas.height);
      const cropBase64 = cropCanvas.toDataURL('image/png').split(',')[1];

      const selAspect = roundedSelection.width > roundedSelection.height ? '16:9' : roundedSelection.width < roundedSelection.height ? '9:16' : '1:1';
      const r = await stitcherEdit(apiKey, MODELS[modelKey].id, {
        cropBase64, cropMimeType: 'image/png', prompt: editPrompt,
        entityRefs,
        aspectRatio: selAspect, resolution,
        advancedConfig: getAdvancedConfig(advanced.settings),
      }, apiProvider);

      const newLayer = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        prompt: editPrompt,
        selection: { ...roundedSelection },
        transform: { ...roundedSelection },
        resultBase64: r.image.base64,
        resultMimeType: r.image.mimeType,
        featherRadius,
        opacity: 100,
        cropInsets: { top: 0, right: 0, bottom: 0, left: 0 },
        flipH: false,
        flipV: false,
        visible: true,
      };
      setLayers(prev => [...prev, newLayer]);
      setSelection(null);
      project.markDirty();
    } catch (e) { setError(e.message || 'Generation failed'); }
    finally { setLoading(false); }
  }, [canGenerate, selection, apiKey, modelKey, editPrompt, entityRefs, featherRadius, advanced.settings, layers]);

  // ── Regenerate a layer ──
  const handleRegen = useCallback(async (layerId) => {
    const layer = layers.find(l => l.id === layerId);
    if (!layer) return;
    setRegenLayerId(layerId); setError('');
    try {
      const srcImg = sourceImgRef.current;
      if (!srcImg) throw new Error('Image not loaded');

      // Ensure integer coordinates for crop to prevent sub-pixel shifting/blurring
      const roundedSelection = {
        x: Math.round(layer.selection.x),
        y: Math.round(layer.selection.y),
        width: Math.round(layer.selection.width),
        height: Math.round(layer.selection.height),
      };

      // Recompose layers BELOW this one
      const idx = layers.indexOf(layer);
      const below = layers.slice(0, idx);
      const compCanvas = document.createElement('canvas');
      compCanvas.width = srcImg.naturalWidth; compCanvas.height = srcImg.naturalHeight;
      const compCtx = compCanvas.getContext('2d');
      compCtx.drawImage(srcImg, 0, 0);
      for (const l of below) { await compositeLayer(compCtx, l); }

      // Crop from that state
      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = roundedSelection.width; cropCanvas.height = roundedSelection.height;
      cropCanvas.getContext('2d').drawImage(compCanvas, roundedSelection.x, roundedSelection.y, roundedSelection.width, roundedSelection.height, 0, 0, cropCanvas.width, cropCanvas.height);

      const selAspect = roundedSelection.width > roundedSelection.height ? '16:9' : roundedSelection.width < roundedSelection.height ? '9:16' : '1:1';
      const r = await stitcherEdit(apiKey, MODELS[modelKey].id, {
        cropBase64: cropCanvas.toDataURL('image/png').split(',')[1],
        cropMimeType: 'image/png', prompt: layer.prompt,
        entityRefs,
        aspectRatio: selAspect, resolution,
        advancedConfig: getAdvancedConfig(advanced.settings),
      }, apiProvider);

      setLayers(prev => prev.map(l => l.id === layerId ? { 
        ...l, 
        selection: { ...roundedSelection },
        transform: { ...roundedSelection },
        resultBase64: r.image.base64, 
        resultMimeType: r.image.mimeType 
      } : l));
      project.markDirty();
    } catch (e) { setError(e.message || 'Regeneration failed'); }
    finally { setRegenLayerId(null); }
  }, [layers, apiKey, modelKey, entityRefs, resolution, advanced.settings]);


  const resetAll = useCallback(() => {
    setSourceImage(null);
    setEditPrompt('');
    setEntityRefs([]);
    setLayers([]); setSelection(null);
    paintDataRef.current = null;
    layerMasksRef.current = {};
    undoStackRef.current = [];
    redoStackRef.current = [];
    setUndoCount(0);
    setLayerAdjustments({});
    setSelectedLayerId(null);
    setCanvasMode('select');
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
    project.newProject();
  }, [setSourceImage, setEditPrompt, setEntityRefs, project.newProject]);

  // ── Save to history + project ──
  const handleSave = useCallback(() => {
    if (!currentImage) return;
    onHistoryAdd?.({
      subTab: 'stitcher', model: MODELS[modelKey].label,
      prompt: editPrompt || 'Sticherr edit',
      result: { image: { base64: currentImage.base64, mimeType: 'image/png' }, text: '', apiPayload: null },
    });
    // Also trigger project save
    project.saveProject().catch(() => {});
  }, [currentImage, modelKey, editPrompt, onHistoryAdd, project.saveProject]);

  // Helper: format time ago for save indicator
  const saveTimeAgo = project.lastSaved ? (() => {
    const diff = Date.now() - project.lastSaved;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  })() : null;

  // ── Ref helpers ──
  const updateRefName = useCallback((i, name) => {
    setEntityRefs(prev => prev.map((r, j) => j === i ? { ...r, name } : r));
  }, [setEntityRefs]);
  const updateRefInstruction = useCallback((i, instruction) => {
    setEntityRefs(prev => prev.map((r, j) => j === i ? { ...r, instruction } : r));
  }, [setEntityRefs]);
  const removeRef = useCallback((i) => {
    setEntityRefs(prev => prev.filter((_, j) => j !== i));
  }, [setEntityRefs]);

  // ── Render ──
  return (
    <div className="studio-split">
      <div className="studio-controls">
        {/* Project Bar */}
        <div className="flex items-center gap-2 rounded-xl border border-mint/25 bg-slate-950/80 px-3 py-2 shadow-lg">
            <button
              onClick={() => setShowProjectBrowser(true)}
              className="p-2 rounded-lg text-surface-300 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer border border-white/10 shrink-0"
              title="Browse projects"
            >
              <FolderOpen size={14} />
            </button>
            <input
              value={project.projectName}
              onChange={e => project.renameProject(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg bg-transparent text-sm font-semibold text-white placeholder:text-surface-600 focus:bg-black/30 outline-none transition-all min-w-0"
              placeholder="Project name..."
            />
            <button
              onClick={resetAll}
              className="p-2 rounded-lg text-surface-400 hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer shrink-0"
              title="New project (Reset all)"
            >
              <RotateCcw size={13} />
            </button>
            {project.isSaving ? (
              <Loader2 size={14} className="animate-spin text-mint shrink-0" />
            ) : project.lastSaved ? (
              <span className="w-2 h-2 rounded-full bg-mint shrink-0" title={`Saved ${saveTimeAgo}`} />
            ) : null}
            <button
              onClick={() => project.saveProject().catch(() => {})}
              disabled={project.isSaving}
              className="btn-mint flex items-center gap-1.5 text-xs font-bold cursor-pointer shrink-0 !px-3 !py-2"
              title="Save project (Ctrl+S)"
            >
              <Save size={13} /> Save
            </button>
        </div>

        {/* Project Browser Modal */}
        <ProjectBrowser
          isOpen={showProjectBrowser}
          onClose={() => setShowProjectBrowser(false)}
          projects={project.projects}
          isLoading={project.isLoadingList}
          onLoad={(id) => project.loadProjectById(id)}
          onDelete={(id) => project.removeProject(id)}
          onExport={(id) => project.exportProject(id)}
          onImport={(file) => project.importProjectFile(file)}
          onRefresh={project.refreshProjects}
        />

        <ErrorBanner error={error} onDismiss={() => setError('')} />

        {/* Card 1: Project & Image Setup */}
        <div className="control-card">
          <h3 className="text-[11px] font-bold text-surface-300 uppercase tracking-wider">Upload</h3>
          
          {/* Source Image Upload */}
          <div className="space-y-m3-xs">

            <ImageUpload label="" image={sourceImage} onImageChange={setSourceImage} onClear={() => setSourceImage(null)} compact fullRes />
          </div>

          {/* Selection Ratio */}
          <div className="space-y-m3-xs">

            <div className="grid grid-cols-2 gap-m3-sm">
              {['1:1', '16:9'].map(r => (
                <button key={r} onClick={() => { setAspectMode(r); setSelection(null); }}
                  className={`py-m3-sm rounded-lg border transition-all duration-150 text-xs font-bold cursor-pointer ${
                    aspectMode === r 
                      ? 'bg-mint/20 border-mint text-white shadow-[0_0_10px_rgba(52,211,153,0.15)]' 
                      : 'bg-slate-900 border-white/10 text-surface-300 hover:bg-slate-800 hover:border-white/20 hover:text-white'
                  }`}>
                  {r === '1:1' ? '■ 1:1 Square' : '▬ 16:9 Wide'}
                </button>
              ))}
            </div>

          </div>
        </div>

        {/* Card 2: Edit Operations */}
        <div className="control-card">
          <h3 className="text-[11px] font-bold text-surface-300 uppercase tracking-wider">Prompt</h3>

          {/* Edit Prompt */}
          <div className="space-y-m3-xs">

            <MentionTextarea
              value={editPrompt}
              onChange={setEditPrompt}
              entities={entityRefs.filter(r => r.name).map(r => ({ name: r.name, type: 'reference', thumbnail: `data:${r.mimeType};base64,${r.base64}` }))}
              rows={3}
              placeholder="What should change? Use @refname to inject reference images (e.g. 'replace jacket with @jacket')..."
              onSubmit={handleGenerate}
            />
          </div>

          {/* References */}
          <div className="space-y-m3-xs">

            {entityRefs.length > 0 && (
              <div className="space-y-m3-sm mb-m3-sm">
                {entityRefs.map((ref, i) => (
                  <div key={i} className="flex items-start gap-m3-sm p-m3-sm rounded-lg bg-black/30 border border-white/10">
                    <img src={`data:${ref.mimeType};base64,${ref.base64}`} alt="" className="w-10 h-10 rounded object-cover shrink-0 border border-white/10" />
                    <div className="flex-1 min-w-0 space-y-m3-xs">
                      <input value={ref.name || ''} onChange={e => updateRefName(i, e.target.value)}
                        placeholder="Name (use @name)" className="w-full bg-slate-900 border border-white/10 rounded px-2 py-1 text-xs text-white outline-none focus:border-mint/50 font-mono" />
                      <input value={ref.instruction || ''} onChange={e => updateRefInstruction(i, e.target.value)}
                        placeholder="Instruction (optional)" className="w-full bg-slate-900 border border-white/10 rounded px-2 py-1 text-[11px] text-surface-300 outline-none focus:border-mint/50" />
                    </div>
                    <button onClick={() => removeRef(i)} className="shrink-0 p-1.5 rounded-lg hover:bg-red-500/10 text-surface-400 hover:text-red-400 transition-colors cursor-pointer border border-transparent hover:border-red-500/20">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {entityRefs.length < 10 && (
              <label className="flex items-center justify-center gap-m3-sm py-m3-md rounded-xl bg-slate-900 border border-dashed border-white/15 cursor-pointer hover:border-mint/40 hover:bg-mint/5 hover:text-white transition-all text-xs text-surface-400 font-medium">
                <ImagePlus size={16} className="text-mint" /> Add Reference Image
                <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file?.type.startsWith('image/')) return;
                  const result = await resizeImage(file);
                  setEntityRefs(prev => [...prev, { ...result, name: `ref${prev.length + 1}`, instruction: '' }]);
                  e.target.value = '';
                }} />
              </label>
            )}
          </div>
        </div>

        {/* Card 3: Model, Quality & Execution */}
        <div className="control-card">
          <h3 className="text-[11px] font-bold text-surface-300 uppercase tracking-wider">Generate</h3>

          {/* Model */}
          <div className="space-y-m3-xs">

            <div className="grid grid-cols-3 gap-m3-sm">
              {Object.entries(MODELS).map(([k, m]) => {
                const d = MODEL_DISPLAY[k] || {};
                return (
                  <button key={k} onClick={() => setModelKey(k)}
                    className={`flex items-center justify-center gap-m3-xs py-m3-md rounded-lg border transition-all duration-150 text-[13px] font-bold cursor-pointer ${
                      modelKey === k 
                        ? 'bg-mint/20 border-mint text-white shadow-[0_0_10px_rgba(52,211,153,0.15)]' 
                        : 'bg-slate-900 border-white/10 text-surface-300 hover:bg-slate-800 hover:border-white/20 hover:text-white'
                    }`}>
                    <span className="text-sm">{d.emoji}</span>{d.label || m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Resolution */}
          <div className="space-y-m3-xs">

            <div className="grid grid-cols-4 gap-m3-sm">
              {[{ key: 'auto', label: 'Auto' }, { key: '1K', label: '1K' }, { key: '2K', label: '2K' }, { key: '4K', label: '4K' }].map(r => (
                <button key={r.key} onClick={() => setResolution(r.key)}
                  disabled={modelKey === 'standard' && r.key !== 'auto'}
                  className={`py-m3-sm rounded-lg border text-xs font-bold transition-all duration-150 cursor-pointer ${
                    resolution === r.key
                      ? 'bg-mint/20 border-mint text-white shadow-[0_0_10px_rgba(52,211,153,0.15)]'
                      : 'bg-slate-900 border-white/10 text-surface-400 hover:bg-slate-800 hover:border-white/20 hover:text-white disabled:opacity-20 disabled:pointer-events-none'
                  }`}>
                  {r.label}
                </button>
              ))}
            </div>

          </div>

          {/* Execution Action Button */}
          <div className="pt-m3-sm">
            <LoadingButton onClick={handleGenerate} disabled={!canGenerate} loading={loading}
              icon={Scissors} label="Generate Edit" loadingLabel="Generating edit layers..." className="btn-mint w-full py-m3-md text-sm cursor-pointer" />
          </div>
        </div>

        {/* Card 4: Layers Manager */}
        <div className="control-card">
          <div className="flex items-center justify-between"><h3 className="text-[11px] font-bold text-surface-300 uppercase tracking-wider">Layers</h3><span className="text-[10px] text-surface-500 font-medium">{layers.length}</span></div>

          {layers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-m3-lg text-center text-surface-500 space-y-m3-xs">
              <Layers size={20} className="opacity-40" />
              <p className="text-xs">No edit layers generated yet.</p>
              <p className="text-[10px] opacity-70">Define an edit area and write a prompt to generate your first edit layer.</p>
            </div>
          ) : (
            <div className="space-y-m3-sm">
              <div className="space-y-m3-xs">
                {/* Layers in reverse order (newest on top) */}
                {[...layers].reverse().map((layer, ri) => {
                  const actualIdx = layers.length - 1 - ri;
                  const isRegen = regenLayerId === layer.id;
                  const isSelected = selectedLayerId === layer.id;
                  const isExpanded = expandedLayerId === layer.id;
                  const t = layer.transform || layer.selection;
                  const crop = layer.cropInsets || { top: 0, right: 0, bottom: 0, left: 0 };
                  return (
                    <div key={layer.id}
                      onClick={() => { setSelectedLayerId(layer.id); setExpandedLayerId(prev => prev === layer.id ? null : layer.id); if (canvasMode !== 'paint') setCanvasMode('transform'); }}
                      className={`rounded-xl border transition-all cursor-pointer overflow-hidden ${
                        isSelected
                          ? 'bg-blue-500/[0.12] border-blue-500/50 ring-1 ring-blue-500/30'
                          : layer.visible ? 'bg-slate-900 border-white/10' : 'bg-slate-900/40 border-white/5 opacity-55'
                      }`}>
                      <div className="flex items-center gap-m3-sm px-m3-md py-m3-sm">
                        {/* Visibility */}
                        <button onClick={(e) => { e.stopPropagation(); toggleLayer(layer.id); }} className="shrink-0 p-1.5 rounded-lg hover:bg-white/[0.10] border border-transparent hover:border-white/10 transition-all cursor-pointer" title={layer.visible ? 'Hide layer' : 'Show layer'}>
                          {layer.visible ? <Eye size={14} className="text-mint" /> : <EyeOff size={14} className="text-surface-500" />}
                        </button>
                        {/* Name */}
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-semibold text-white truncate">{layer.prompt || 'Seamless Edit'}</div>

                        </div>
                        {/* Controls */}
                        <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                          <button onClick={() => moveLayer(layer.id, 1)} disabled={actualIdx >= layers.length - 1}
                            className="shrink-0 p-1 rounded-md hover:bg-white/[0.10] text-surface-400 hover:text-white transition-all disabled:opacity-20 cursor-pointer" title="Move up">
                            <ChevronUp size={14} />
                          </button>
                          <button onClick={() => moveLayer(layer.id, -1)} disabled={actualIdx <= 0}
                            className="shrink-0 p-1 rounded-md hover:bg-white/[0.10] text-surface-400 hover:text-white transition-all disabled:opacity-20 cursor-pointer" title="Move down">
                            <ChevronDown size={14} />
                          </button>
                          <button onClick={() => handleRegen(layer.id)} disabled={isRegen}
                            className="shrink-0 p-1 rounded-md hover:bg-white/[0.10] text-surface-400 hover:text-mint transition-all cursor-pointer" title="Regenerate">
                            <RefreshCw size={13} className={isRegen ? 'animate-spin' : ''} />
                          </button>
                          <button onClick={() => deleteLayer(layer.id)}
                            className="shrink-0 p-1 rounded-md hover:bg-white/[0.10] text-surface-400 hover:text-red-400 transition-all cursor-pointer" title="Delete">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {/* Per-layer feather + opacity sliders */}
                      {isExpanded && (
                        <div className="space-y-m3-xs px-m3-md pb-m3-sm border-t border-white/[0.04] pt-m3-xs bg-black/20">
                          <div className="flex items-center gap-m3-sm">
                            <span className="text-[10px] font-medium text-surface-400 w-12">Feather</span>
                            <input type="range" min={0} max={60} step={1} value={layer.featherRadius}
                              onChange={e => updateLayerFeather(layer.id, Number(e.target.value))}
                              onClick={e => e.stopPropagation()}
                              className="flex-1 accent-mint h-1 cursor-pointer" />
                            <span className="text-[10px] font-mono text-surface-300 w-8 text-right">{layer.featherRadius}px</span>
                          </div>
                          <div className="flex items-center gap-m3-sm">
                            <span className="text-[10px] font-medium text-surface-400 w-12">Opacity</span>
                            <input type="range" min={0} max={100} step={1} value={layer.opacity ?? 100}
                              onChange={e => updateLayerOpacity(layer.id, Number(e.target.value))}
                              onClick={e => e.stopPropagation()}
                              className="flex-1 accent-accent h-1 cursor-pointer" />
                            <span className="text-[10px] font-mono text-surface-300 w-8 text-right">{layer.opacity ?? 100}%</span>
                          </div>
                        </div>
                      )}


                      
                      {/* Mask indicator + reset */}
                      {layerMasksRef.current[layer.id] && layer.visible && (
                        <div className="px-m3-md pb-m3-sm bg-black/20 border-t border-white/[0.04] pt-m3-xs flex items-center gap-m3-xs">
                          <span className="text-[10px] text-purple-400 flex items-center gap-m3-xs font-semibold"><EyeOff size={10} /> Active Mask Applied</span>
                          <button onClick={(e) => {
                            e.stopPropagation();
                            pushPaintUndo();
                            delete layerMasksRef.current[layer.id];
                            recompose(layers);
                            project.markDirty();
                          }}
                            className="text-[10px] font-bold text-surface-450 hover:text-white ml-auto transition-colors cursor-pointer">
                            Reset Mask
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>


            </div>
          )}
        </div>

        <AdvancedSettings {...advanced} />
      </div>

      {/* Right Panel — Canvas */}
      <div className={`studio-preview relative ${theme === 'light' ? 'canvas-light' : ''}`} ref={containerRef}>
        {/* Canvas Mode Toolbar */}
        {currentImage && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center rounded-2xl border shadow-2xl"
            style={{ gap: '6px', padding: '8px 14px', background: 'var(--color-surface-950)', borderColor: 'rgba(16,185,129,0.18)', backdropFilter: 'blur(16px)' }}
          >
            <button
              onClick={() => { setCanvasMode('select'); setSelectedLayerId(null); }}
              title="Select"
              className={`flex items-center justify-center rounded-xl transition-all cursor-pointer ${
                canvasMode === 'select'
                  ? 'bg-mint/20 text-mint border border-mint/50 shadow-sm'
                  : 'text-surface-400 hover:text-surface-100 hover:bg-surface-800/40 border border-transparent'
              }`}
              style={{ width: '36px', height: '36px' }}
            >
              <MousePointer2 size={16} />
            </button>
            {layers.length > 0 && (
              <button
                onClick={() => setCanvasMode('transform')}
                title="Transform"
                className={`flex items-center justify-center rounded-xl transition-all cursor-pointer ${
                  canvasMode === 'transform'
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/50 shadow-sm'
                    : 'text-surface-400 hover:text-surface-100 hover:bg-surface-800/40 border border-transparent'
                }`}
                style={{ width: '36px', height: '36px' }}
              >
                <Move size={16} />
              </button>
            )}
            <div style={{ width: '1px', height: '24px', background: 'var(--color-surface-600)', opacity: 0.2, margin: '0 2px' }} />
            <button
              onClick={() => setCanvasMode('paint')}
              title="Paint"
              className={`flex items-center justify-center rounded-xl transition-all cursor-pointer ${
                canvasMode === 'paint'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-sm'
                  : 'text-surface-400 hover:text-surface-100 hover:bg-surface-800/40 border border-transparent'
              }`}
              style={{ width: '36px', height: '36px' }}
            >
              <Paintbrush size={16} />
            </button>
            <div style={{ width: '1px', height: '24px', background: 'var(--color-surface-600)', opacity: 0.2, margin: '0 2px' }} />
            {/* Zoom Controls */}
            <div className="flex items-center" style={{ gap: '4px' }}>
              <button onClick={handleZoomOut}
                className="flex items-center justify-center rounded-lg text-surface-400 hover:text-surface-100 hover:bg-surface-800/40 transition-all cursor-pointer"
                style={{ width: '32px', height: '32px' }}
                title="Zoom out"
              >
                <ZoomOut size={15} />
              </button>
              <span className="text-[11px] font-semibold font-mono text-surface-300 text-center select-none" style={{ minWidth: '42px' }}>
                {Math.round(zoomLevel * 100)}%
              </span>
              <button onClick={handleZoomIn}
                className="flex items-center justify-center rounded-lg text-surface-400 hover:text-surface-100 hover:bg-surface-800/40 transition-all cursor-pointer"
                style={{ width: '32px', height: '32px' }}
                title="Zoom in"
              >
                <ZoomIn size={15} />
              </button>
              <button onClick={handleZoomFit}
                className="flex items-center justify-center rounded-lg text-surface-400 hover:text-surface-100 hover:bg-surface-800/40 transition-all cursor-pointer"
                style={{ width: '32px', height: '32px' }}
                title="Fit to screen"
              >
                <Maximize size={15} />
              </button>
            </div>
          </div>
        )}

        {/* Paint Controls Bar */}
        {currentImage && canvasMode === 'paint' && (
          <div className="absolute z-10 flex items-center rounded-xl border shadow-xl"
            style={{ top: '68px', left: '50%', transform: 'translateX(-50%)', gap: '8px', padding: '6px 12px', background: 'var(--color-surface-950)', borderColor: 'rgba(16,185,129,0.12)', backdropFilter: 'blur(12px)' }}
          >
            {/* Tool toggle */}
            <div className="flex items-center rounded-lg" style={{ gap: '2px', padding: '3px', background: 'var(--color-surface-900)' }}>
              <button onClick={() => setPaintTool('brush')}
                className={`flex items-center rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                  paintTool === 'brush' ? 'bg-amber-500/20 text-amber-400' : 'text-surface-400 hover:text-surface-100'
                }`}
                style={{ gap: '4px', padding: '5px 8px' }}>
                <Paintbrush size={11} /> Brush
              </button>
              <button onClick={() => setPaintTool('eraser')}
                className={`flex items-center rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                  paintTool === 'eraser' ? 'bg-red-500/20 text-red-400' : 'text-surface-400 hover:text-surface-100'
                }`}
                style={{ gap: '4px', padding: '5px 8px' }}>
                <Eraser size={11} /> Eraser
              </button>
            </div>

            {/* Mask tools divider */}
            <div style={{ width: '1px', height: '20px', background: 'var(--color-surface-600)', opacity: 0.2 }} />
            <div className="flex items-center rounded-lg" style={{ gap: '2px', padding: '3px', background: 'var(--color-surface-900)' }}>
              <button onClick={() => setPaintTool('mask')}
                title="Erase parts of selected layer"
                className={`flex items-center rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                  paintTool === 'mask' ? 'bg-purple-500/20 text-purple-400' : 'text-surface-400 hover:text-surface-100'
                }`}
                style={{ gap: '4px', padding: '5px 8px' }}>
                <EyeOff size={11} /> Mask
              </button>
              <button onClick={() => setPaintTool('unmask')}
                title="Restore masked parts of selected layer"
                className={`flex items-center rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                  paintTool === 'unmask' ? 'bg-green-500/20 text-green-400' : 'text-surface-400 hover:text-surface-100'
                }`}
                style={{ gap: '4px', padding: '5px 8px' }}>
                <Eye size={11} /> Unmask
              </button>
            </div>

            {(paintTool === 'mask' || paintTool === 'unmask') && (
              <>
                <div style={{ width: '1px', height: '20px', background: 'var(--color-surface-600)', opacity: 0.2 }} />
                <button onClick={() => setShowMaskOverlay(!showMaskOverlay)}
                  title="Toggle red overlay of masked areas (Quick Mask mode)"
                  className={`flex items-center rounded-lg text-[10px] font-bold transition-all border cursor-pointer ${
                    showMaskOverlay
                      ? 'bg-red-500/15 text-red-400 border-red-500/30'
                      : 'text-surface-400 border-transparent hover:text-surface-100'
                  }`}
                  style={{ gap: '5px', padding: '5px 8px' }}>
                  <span className={`w-2 h-2 rounded-full transition-all ${
                    showMaskOverlay ? 'bg-red-500 animate-pulse' : 'bg-surface-500'
                  }`} />
                  Overlay
                </button>
              </>
            )}

            {/* Divider */}
            <div style={{ width: '1px', height: '20px', background: 'var(--color-surface-600)', opacity: 0.2 }} />

            {/* Color picker */}
            {paintTool === 'brush' && (
              <label className="flex items-center cursor-pointer">
                <input type="color" value={brushColor} onChange={e => setBrushColor(e.target.value)}
                  className="w-7 h-7 rounded-lg cursor-pointer bg-transparent"
                  style={{ appearance: 'none', WebkitAppearance: 'none', padding: 0, border: '1.5px solid var(--color-surface-600)' }} />
              </label>
            )}

            {/* Size */}
            <div className="flex items-center" style={{ gap: '5px' }}>
              <Circle size={10} className="text-surface-500" />
              <input type="range" min={1} max={100} step={1} value={brushSize}
                onChange={e => setBrushSize(Number(e.target.value))}
                className="w-16 accent-amber-400 h-1 cursor-pointer" />
              <span className="text-[9px] font-mono text-surface-400 w-6 text-right">{brushSize}</span>
            </div>

            {/* Opacity */}
            <div className="flex items-center" style={{ gap: '5px' }}>
              <span className="text-[9px] text-surface-500 font-medium">Op</span>
              <input type="range" min={1} max={100} step={1} value={brushOpacity}
                onChange={e => setBrushOpacity(Number(e.target.value))}
                className="w-14 accent-amber-400 h-1 cursor-pointer" />
              <span className="text-[9px] font-mono text-surface-400 w-7 text-right">{brushOpacity}%</span>
            </div>

            {/* Hardness */}
            <div className="flex items-center" style={{ gap: '5px' }}>
              <span className="text-[9px] text-surface-500 font-medium">Hd</span>
              <input type="range" min={0} max={100} step={5} value={brushHardness}
                onChange={e => setBrushHardness(Number(e.target.value))}
                className="w-12 accent-amber-400 h-1 cursor-pointer" />
              <span className="text-[9px] font-mono text-surface-400 w-7 text-right">{brushHardness}%</span>
            </div>

            {/* Divider */}
            <div style={{ width: '1px', height: '20px', background: 'var(--color-surface-600)', opacity: 0.2 }} />

            {/* Undo / Redo / Clear */}
            <button onClick={paintUndo} disabled={undoStackRef.current.length === 0}
              className="flex items-center justify-center rounded-lg text-surface-400 hover:text-surface-100 hover:bg-surface-800/40 disabled:opacity-30 transition-colors cursor-pointer"
              style={{ width: '28px', height: '28px' }} title="Undo (Ctrl+Z)">
              <Undo size={13} />
            </button>
            <button onClick={paintRedo} disabled={redoStackRef.current.length === 0}
              className="flex items-center justify-center rounded-lg text-surface-400 hover:text-surface-100 hover:bg-surface-800/40 disabled:opacity-30 transition-colors cursor-pointer"
              style={{ width: '28px', height: '28px' }} title="Redo (Ctrl+Y)">
              <Redo size={13} />
            </button>
            <button onClick={clearPaintOverlay}
              className="flex items-center justify-center rounded-lg text-surface-400 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
              style={{ width: '28px', height: '28px' }} title="Clear paint overlay">
              <Trash2 size={13} />
            </button>
          </div>
        )}

        {/* Mask tool hint */}
        {currentImage && canvasMode === 'paint' && (paintTool === 'mask' || paintTool === 'unmask') && (
          <div className={`absolute z-10 left-1/2 -translate-x-1/2 px-m3-md py-m3-xs rounded-lg text-[10px] font-semibold shadow-md backdrop-blur-md ${
            selectedLayerId
              ? 'bg-purple-950/90 text-purple-200 border border-purple-500/30'
              : 'bg-red-950/90 text-red-200 border border-red-500/30'
          }`} style={{ top: canvasMode === 'paint' ? '6.5rem' : '5rem' }}>
            {selectedLayerId
              ? `${paintTool === 'mask' ? '🎭 Masking' : '✨ Unmasking'}: Layer ${layers.findIndex(l => l.id === selectedLayerId) + 1} — click layer in panel to switch`
              : '⚠ Select a layer in the panel to use mask tools'
            }
          </div>
        )}

        {currentImage ? (
          <div className="flex flex-col items-center justify-center w-full h-full p-m3-md"
            style={{ paddingTop: canvasMode === 'paint' ? '5rem' : '3.5rem', overflow: 'hidden' }}
          >
            <div style={{
              transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
              transition: isPanningRef.current ? 'none' : 'transform 0.1s ease-out',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              maxWidth: '100%',
              maxHeight: '100%',
            }}>
              <canvas ref={canvasRef}
                onMouseDown={handlePointerDown}
                onMouseMove={(e) => { handlePointerMove(e); e.target.style.cursor = getCursor(e); }}
                onMouseUp={handlePointerUp} onMouseLeave={(e) => { handlePointerUp(e); setBrushCursorPos(null); }}
                onTouchStart={handlePointerDown} onTouchMove={handlePointerMove} onTouchEnd={handlePointerUp}
                className="rounded-lg shadow-2xl" style={{ cursor: spaceHeldRef.current ? 'grab' : canvasMode === 'paint' ? 'crosshair' : canvasMode === 'select' ? 'crosshair' : 'default' }}
              />
            </div>
            <button onClick={() => downloadImage(currentImage.base64, currentImage.mimeType, `sticherr_${Date.now()}.png`)}
              className="absolute bottom-m3-md left-1/2 -translate-x-1/2 z-10 btn-accent flex items-center gap-2 text-xs font-bold cursor-pointer hover:scale-105 active:scale-95 transition-all duration-200 shadow-lg"
              title="Download final edited image"
            >
              <Download size={14} /> Download Image
            </button>
          </div>
        ) : !loading ? (
          <div className="empty-state flex-1">
            <div className="empty-state-icon"><Scissors size={28} className="text-white" /></div>
            <h3 className="text-lg font-bold text-surface-300 mb-2">Sticherr</h3>
            <p className="text-sm text-surface-500 max-w-xs">Upload an image, select an area, and edit it with AI while keeping everything else intact.</p>
          </div>
        ) : (
          <div className="w-full max-w-2xl animate-slide-up mx-auto">
            <div className="skeleton-image rounded-lg" style={{ aspectRatio: '16/9' }}><div className="skeleton-shimmer" /></div>
            <p className="text-xs text-surface-500 text-center mt-4 animate-pulse">Editing selected area...</p>
          </div>
        )}
      </div>
    </div>
  );
}
