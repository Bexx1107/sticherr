// ── Project Browser Modal ──────────────────────────────────────────────
// Grid of saved Sticherr projects with load, delete, export, rename.

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, FolderOpen, Trash2, Download, Pencil, Check, Upload, Search, Clock, Layers, FileDown } from 'lucide-react';
import { getProjectThumbUrl } from '../../lib/api';

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

export default function ProjectBrowser({
  isOpen,
  onClose,
  projects,
  isLoading,
  onLoad,
  onDelete,
  onExport,
  onImport,
  onRefresh,
}) {
  const [search, setSearch] = useState('');
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      onRefresh?.();
      setSearch('');
      setRenamingId(null);
      setConfirmDeleteId(null);
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filtered = (projects || [])
    .filter(p => !search || p.name?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  const handleImportClick = () => fileInputRef.current?.click();
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await onImport?.(file);
      onClose();
    } catch (err) {
      console.error('Import failed:', err);
    }
    e.target.value = '';
  };

  const handleDelete = async (id) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    await onDelete?.(id);
    setConfirmDeleteId(null);
  };

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-m3-md"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-3xl max-h-[80vh] bg-surface-900 border border-white/[0.14] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-scale-in"
        style={{ background: 'linear-gradient(180deg, rgba(15,23,42,0.98) 0%, rgba(2,6,23,0.99) 100%)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-m3-ml py-m3-md border-b border-white/[0.12]">
          <div className="flex items-center gap-m3-ms">
            <div className="w-9 h-9 rounded-xl bg-mint/10 flex items-center justify-center">
              <FolderOpen size={18} className="text-mint" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Projects</h2>
              <p className="text-[11px] text-surface-500 font-medium">{filtered.length} saved project{filtered.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-m3-sm">
            <button
              onClick={handleImportClick}
              className="flex items-center gap-m3-xs px-m3-ms py-m3-xs rounded-lg bg-white/[0.07] border border-white/[0.10] text-surface-300 text-[11px] font-semibold hover:bg-white/[0.12] hover:text-white transition-all"
            >
              <Upload size={12} /> Import .dmd
            </button>
            <input ref={fileInputRef} type="file" accept=".dmd,.json" className="hidden" onChange={handleFileChange} />
            <button onClick={onClose} className="p-m3-xs rounded-lg hover:bg-white/[0.08] text-surface-400 hover:text-white transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-m3-ml py-m3-ms border-b border-white/[0.08]">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500 z-10 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search projects..."
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-white/[0.05] border border-white/[0.08] text-sm text-white placeholder:text-surface-500 outline-none focus:border-mint/30 transition-colors"
            />
          </div>
        </div>

        {/* Project Grid */}
        <div className="flex-1 overflow-y-auto p-m3-ml">
          {isLoading ? (
            <div className="grid grid-cols-3 gap-m3-ms">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="aspect-[4/3] rounded-xl bg-white/[0.04] animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-white/[0.05] flex items-center justify-center mb-m3-md">
                <FolderOpen size={24} className="text-surface-500" />
              </div>
              <p className="text-sm font-semibold text-surface-400 mb-1">
                {search ? 'No projects match your search' : 'No saved projects yet'}
              </p>
              <p className="text-[11px] text-surface-500">
                {search ? 'Try a different search term' : 'Start editing in Sticherr to create your first project'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-m3-ms">
              {filtered.map(project => (
                <div
                  key={project.id}
                  className="group relative rounded-xl border border-white/[0.08] hover:border-white/[0.16] bg-white/[0.03] hover:bg-white/[0.05] transition-all cursor-pointer overflow-hidden"
                  onClick={() => { onLoad?.(project.id); onClose(); }}
                >
                  {/* Thumbnail */}
                  <div className="aspect-[4/3] bg-black/30 overflow-hidden">
                    <img
                      src={getProjectThumbUrl(project.id)}
                      alt={project.name}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  </div>

                  {/* Info */}
                  <div className="p-m3-ms">
                    {renamingId === project.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onClick={e => e.stopPropagation()}
                          onKeyDown={e => { if (e.key === 'Enter') setRenamingId(null); if (e.key === 'Escape') setRenamingId(null); }}
                          autoFocus
                          className="flex-1 bg-transparent border-b border-mint/40 text-xs text-white py-0.5 outline-none font-semibold"
                        />
                        <button onClick={(e) => { e.stopPropagation(); setRenamingId(null); }} className="p-0.5 text-mint">
                          <Check size={12} />
                        </button>
                      </div>
                    ) : (
                      <h3 className="text-xs font-bold text-surface-200 truncate">{project.name || 'Untitled'}</h3>
                    )}
                    <div className="flex items-center gap-m3-sm mt-m3-xs text-[10px] text-surface-500">
                      <span className="flex items-center gap-m3-xs"><Layers size={9} />{project.layerCount || 0} layers</span>
                      <span>·</span>
                      <span className="flex items-center gap-m3-xs"><Clock size={9} />{timeAgo(project.updatedAt)}</span>
                    </div>
                  </div>

                  {/* Actions overlay */}
                  <div
                    className="absolute top-2 right-2 flex items-center gap-1.5 z-20"
                    onClick={e => e.stopPropagation()}
                  >
                    <button
                      onClick={(e) => { e.stopPropagation(); setRenamingId(project.id); setRenameValue(project.name || ''); }}
                      className="p-2 rounded-lg bg-black/80 backdrop-blur-sm text-surface-300 hover:text-white transition-all hover:scale-105 active:scale-95 cursor-pointer border border-white/10"
                      title="Rename"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onExport?.(project.id); }}
                      className="p-2 rounded-lg bg-black/80 backdrop-blur-sm text-surface-300 hover:text-mint transition-all hover:scale-105 active:scale-95 cursor-pointer border border-white/10"
                      title="Export .dmd"
                    >
                      <FileDown size={14} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(project.id); }}
                      className={`p-2 rounded-lg backdrop-blur-sm transition-all hover:scale-105 active:scale-95 cursor-pointer border ${
                        confirmDeleteId === project.id
                          ? 'bg-red-500 text-white border-red-400/50 shadow-[0_0_12px_rgba(239,68,68,0.4)]'
                          : 'bg-black/80 text-surface-300 hover:text-red-400 border-white/10'
                      }`}
                      title={confirmDeleteId === project.id ? 'Click again to confirm' : 'Delete'}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
