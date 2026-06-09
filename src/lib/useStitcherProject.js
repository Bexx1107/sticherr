// ── Stitcher Project Management Hook ──────────────────────────────────
// Handles save/load/auto-save of Stitcher projects to the server.
// Projects are stored server-side so they survive across browsers/devices.

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  listProjects,
  createProject as apiCreateProject,
  loadProject as apiLoadProject,
  updateProject as apiUpdateProject,
  deleteProject as apiDeleteProject,
  importProject as apiImportProject,
  getProjectExportUrl,
} from './api';

const AUTO_SAVE_DELAY = 3000; // 3 seconds

/**
 * Hook for managing Stitcher project state.
 *
 * @param {Object} opts
 * @param {Function} opts.getProjectData - Returns the current project data snapshot
 * @param {Function} opts.onProjectLoaded - Called when a project is loaded with its data
 * @returns Project management state and actions
 */
export function useStitcherProject({ getProjectData, onProjectLoaded }) {
  const [projectId, setProjectId] = useState(null);
  const [projectName, setProjectName] = useState('Untitled Project');
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [projects, setProjects] = useState([]);
  const [isLoadingList, setIsLoadingList] = useState(false);

  const autoSaveTimer = useRef(null);
  const projectIdRef = useRef(null);
  const getDataRef = useRef(getProjectData);
  getDataRef.current = getProjectData;

  // Keep ref in sync
  useEffect(() => {
    projectIdRef.current = projectId;
  }, [projectId]);

  // ── Fetch project list ──
  const refreshProjects = useCallback(async () => {
    setIsLoadingList(true);
    try {
      const list = await listProjects();
      setProjects(Array.isArray(list) ? list : []);
    } catch (e) {
      console.warn('[project] Failed to list projects:', e);
    } finally {
      setIsLoadingList(false);
    }
  }, []);

  // ── Save project (create or update) ──
  const saveProject = useCallback(async () => {
    const data = getDataRef.current();
    if (!data || !data.sourceImage) return null;

    setIsSaving(true);
    try {
      const payload = {
        name: data.name || 'Untitled Project',
        sourceBase64: data.sourceImage.base64,
        sourceMimeType: data.sourceImage.mimeType,
        modelKey: data.modelKey || 'standard',
        editPrompt: data.editPrompt || '',
        aspectMode: data.aspectMode || '1:1',
        featherRadius: data.featherRadius ?? 12,
        resolution: data.resolution || 'auto',
        entityRefs: (data.entityRefs || []).map(r => ({
          base64: r.base64,
          mimeType: r.mimeType,
          name: r.name || '',
          instruction: r.instruction || '',
        })),
        layers: (data.layers || []).map(l => ({
          id: l.id,
          prompt: l.prompt || '',
          visible: l.visible !== false,
          featherRadius: l.featherRadius ?? 12,
          opacity: l.opacity ?? 100,
          selection: l.selection,
          transform: l.transform || l.selection,
          cropInsets: l.cropInsets || { top: 0, right: 0, bottom: 0, left: 0 },
          flipH: l.flipH || false,
          flipV: l.flipV || false,
          adjustments: l.adjustments || null,
          resultBase64: l.resultBase64,
          resultMimeType: l.resultMimeType || 'image/png',
        })),
        paintOverlayBase64: data.paintOverlayBase64 || null,
        layerMasks: data.layerMasks || null,
      };

      let result;
      if (projectIdRef.current) {
        // Update existing
        result = await apiUpdateProject(projectIdRef.current, payload);
      } else {
        // Create new
        result = await apiCreateProject(payload);
        if (result.project?.id) {
          setProjectId(result.project.id);
        }
      }

      setIsDirty(false);
      setLastSaved(Date.now());
      return result;
    } catch (e) {
      console.error('[project] Save failed:', e);
      throw e;
    } finally {
      setIsSaving(false);
    }
  }, []);

  // ── Auto-save (debounced) ──
  const markDirty = useCallback(() => {
    setIsDirty(true);
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      saveProject().catch(e => console.warn('[project] Auto-save failed:', e));
    }, AUTO_SAVE_DELAY);
  }, [saveProject]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, []);

  // ── Load project ──
  const loadProjectById = useCallback(async (id) => {
    try {
      const data = await apiLoadProject(id);
      setProjectId(data.id);
      setProjectName(data.name || 'Untitled Project');
      setIsDirty(false);
      setLastSaved(data.updatedAt || Date.now());
      onProjectLoaded?.(data);
      return data;
    } catch (e) {
      console.error('[project] Load failed:', e);
      throw e;
    }
  }, [onProjectLoaded]);

  // ── Delete project ──
  const removeProject = useCallback(async (id) => {
    try {
      await apiDeleteProject(id);
      setProjects(prev => prev.filter(p => p.id !== id));
      if (projectIdRef.current === id) {
        setProjectId(null);
        setProjectName('Untitled Project');
        setIsDirty(false);
        setLastSaved(null);
      }
    } catch (e) {
      console.error('[project] Delete failed:', e);
      throw e;
    }
  }, []);

  // ── New project (reset) ──
  const newProject = useCallback(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setProjectId(null);
    setProjectName('Untitled Project');
    setIsDirty(false);
    setLastSaved(null);
  }, []);

  // ── Rename project ──
  const renameProject = useCallback((name) => {
    setProjectName(name);
    setIsDirty(true);
  }, []);

  // ── Export project ──
  const exportProject = useCallback(async (id) => {
    const targetId = id && typeof id === 'string' ? id : projectIdRef.current;

    // Export live editor state directly if exporting the currently active project
    if (!id || id === projectIdRef.current) {
      const data = getDataRef.current();
      if (data && data.sourceImage) {
        try {
          const exportData = {
            type: 'floui-stitcher-project',
            version: 1,
            name: data.name || 'Untitled Project',
            sourceBase64: data.sourceImage.base64,
            sourceMimeType: data.sourceImage.mimeType,
            modelKey: data.modelKey || 'standard',
            editPrompt: data.editPrompt || '',
            aspectMode: data.aspectMode || '1:1',
            featherRadius: data.featherRadius ?? 12,
            resolution: data.resolution || 'auto',
            entityRefs: (data.entityRefs || []).map(r => ({
              base64: r.base64,
              mimeType: r.mimeType,
              name: r.name || '',
              instruction: r.instruction || '',
            })),
            layers: (data.layers || []).map(l => ({
              id: l.id,
              prompt: l.prompt || '',
              visible: l.visible !== false,
              featherRadius: l.featherRadius ?? 12,
              opacity: l.opacity ?? 100,
              selection: l.selection,
              transform: l.transform || l.selection,
              cropInsets: l.cropInsets || { top: 0, right: 0, bottom: 0, left: 0 },
              flipH: l.flipH || false,
              flipV: l.flipV || false,
              adjustments: l.adjustments || null,
              resultBase64: l.resultBase64,
              resultMimeType: l.resultMimeType || 'image/png',
            })),
            paintOverlayBase64: data.paintOverlayBase64 || null,
            layerMasks: data.layerMasks || null,
          };
          const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${exportData.name || 'project'}.dmd`;
          link.click();
          URL.revokeObjectURL(url);
          return;
        } catch (e) {
          console.warn('[project] Live state export failed, falling back to storage:', e);
        }
      }
    }

    if (!targetId) return;
    try {
      const projectData = await apiLoadProject(targetId);
      const exportData = {
        type: 'floui-stitcher-project',
        version: 1,
        ...projectData,
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${projectData.name || 'project'}.dmd`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('[project] Export failed:', e);
    }
  }, []);

  // ── Import project from .dmd file ──
  const importProjectFile = useCallback(async (file) => {
    try {
      const text = await file.text();
      const dmdData = JSON.parse(text);
      if (dmdData.type !== 'floui-stitcher-project') {
        throw new Error('Invalid .dmd file format');
      }
      const result = await apiImportProject(dmdData);
      if (result.project?.id) {
        await loadProjectById(result.project.id);
      }
      return result;
    } catch (e) {
      console.error('[project] Import failed:', e);
      throw e;
    }
  }, [loadProjectById]);

  return {
    // State
    projectId,
    projectName,
    isDirty,
    isSaving,
    lastSaved,
    projects,
    isLoadingList,

    // Actions
    newProject,
    saveProject,
    loadProjectById,
    removeProject,
    renameProject,
    exportProject,
    importProjectFile,
    refreshProjects,
    markDirty,
  };
}
