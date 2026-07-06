import { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Upload, X, Download, AlertCircle, Eye, EyeOff, Maximize2, Check, Sun, Moon, ChevronDown } from 'lucide-react';
import { resizeImage, readImageFullRes, imageToDataUrl, downloadImage } from '../lib/imageUtils';

// ─── Reusable Image Lightbox ────────────────────────────────────
export function ImageLightbox({ src, name, onClose }) {
  const [showPrompt, setShowPrompt] = useState(false);
  if (!src) return null;
  return createPortal(
    <div className="fixed inset-0 z-[999] flex items-center justify-center animate-fade-in" onClick={onClose}
      style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(12px)' }}
    >
      <div className="relative max-w-[90vw] max-h-[90vh] animate-scale-in" onClick={e => e.stopPropagation()}>
        <img src={src} alt="" className="max-w-[90vw] max-h-[90vh] object-contain rounded-xl"
          style={{ boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}
        />
        {/* Prompt overlay */}
        {showPrompt && name && (
          <div className="absolute bottom-14 left-4 right-4 text-white text-xs font-mono px-4 py-3 rounded-lg max-h-32 overflow-y-auto leading-relaxed"
            style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.12)' }}
          >
            {name}
          </div>
        )}
        {/* Bottom toolbar */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2">
          {name && (
            <button onClick={() => setShowPrompt(!showPrompt)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[11px] font-semibold transition-all ${
                showPrompt 
                  ? 'bg-accent/20 text-accent border border-accent/25' 
                  : 'text-surface-300 border border-white/[0.14] hover:text-white hover:border-white/[0.15]'
              }`}
              style={{ background: showPrompt ? undefined : 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
            >
              {showPrompt ? <EyeOff size={12} /> : <Eye size={12} />}
              {showPrompt ? 'Hide Prompt' : 'Show Prompt'}
            </button>
          )}
          <a href={src} download={`image_${Date.now()}.png`}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-surface-300 border border-white/[0.14] text-[11px] font-semibold hover:text-white hover:border-white/[0.15] transition-all"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
          >
            <Download size={12} /> Download
          </a>
        </div>
        <button onClick={onClose} aria-label="Close preview"
          className="absolute -top-3 -right-3 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-red-500 transition-all duration-200"
          style={{ background: 'rgba(33,33,33,0.95)', border: '1px solid rgba(255,255,255,0.14)', boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}
        >
          <X size={14} />
        </button>
      </div>
    </div>,
    document.body
  );
}

// ─── API Key Input ──────────────────────────────────────────────
export function ApiKeyInput({ apiKey, setApiKey, compact = false }) {
  const [visible, setVisible] = useState(false);

  const handleChange = (e) => {
    const rawVal = e.target.value;
    const cleaned = rawVal.trim().replace(/['"\s]/g, '');
    setApiKey(cleaned);
  };

  const isKeyPresent = apiKey && apiKey.length > 0;
  const isValidFormat = isKeyPresent && apiKey.length >= 20;

  return (
    <div className={compact ? 'mb-1.5' : 'mb-0'}>
      <label className="section-label flex items-center justify-between select-none">
        <span>Floyo API key</span>
        {isKeyPresent && (
          <span className={`text-[10px] font-bold tracking-wide uppercase transition-colors duration-200 ${
            isValidFormat ? 'text-mint' : 'text-accent'
          }`}>
            {isValidFormat ? '✓ Key set' : '✗ Key too short'}
          </span>
        )}
      </label>
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'} 
          value={apiKey}
          onChange={handleChange}
          placeholder="Enter your Floyo API key..."
          className={`input-field w-full pr-10 text-[12px] transition-all duration-200 ${
            isKeyPresent ? (isValidFormat ? 'border-mint/30 focus:border-mint' : 'border-accent/40 focus:border-accent') : ''
          }`}
        />
        <button onClick={() => setVisible(!visible)} className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-mint transition-all duration-150 hover:scale-110 active:scale-90 cursor-pointer" title={visible ? "Hide API key" : "Show API key"}>
          {visible ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    </div>
  );
}

// ─── Image Upload ───────────────────────────────────────────────
export function ImageUpload({ label, image, onImageChange, onClear, compact = false, multiple = false, fullRes = false }) {
  const inputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const processImage = useCallback(async (file) => {
    return fullRes ? readImageFullRes(file) : resizeImage(file);
  }, [fullRes]);

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setLoading(true);
    try {
      const result = await processImage(file);
      onImageChange(result);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [onImageChange, processImage]);

  const handleFiles = useCallback(async (files) => {
    if (!files || files.length === 0) return;
    setLoading(true);
    try {
      const results = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;
        results.push(await processImage(file));
      }
      for (const result of results) {
        onImageChange(result);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [onImageChange, processImage]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    if (multiple || !image) {
      handleFiles(e.dataTransfer.files);
    } else {
      handleFile(e.dataTransfer.files[0]);
    }
  }, [handleFile, handleFiles, multiple, image]);

  const handleInputChange = useCallback((e) => {
    if (multiple || !image) {
      handleFiles(e.target.files);
    } else {
      handleFile(e.target.files[0]);
    }
    e.target.value = '';
  }, [handleFile, handleFiles, multiple, image]);

  if (image && !multiple) {
    return (
      <div className="relative">
        {label && <label className="section-label">{label}</label>}
        <div className="image-card relative">
          <img src={imageToDataUrl(image.base64, image.mimeType)} alt="Uploaded" className={`w-full object-cover ${compact ? 'max-h-32' : 'max-h-48'}`} />
          <button onClick={onClear} className="absolute top-2 right-2 bg-red-600/90 hover:bg-red-500 text-white rounded-lg p-1.5 transition-all shadow-lg z-10 cursor-pointer" title="Remove image">
            <X size={12} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {label && <label className="section-label">{label}</label>}
      <div
        onClick={() => inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        className={`rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all duration-200 ${
          compact ? 'py-5' : 'py-8'
        } ${
          dragOver 
            ? 'border-accent/60 bg-accent/[0.04]' 
            : 'border-surface-600/15 hover:border-surface-500/25 hover:bg-white/[0.04]'
        }`}
        style={{ border: `1px dashed ${dragOver ? 'rgba(240,115,22,0.4)' : 'rgba(255,255,255,0.14)'}` }}
      >
        {loading ? (
          <div className="spinner" />
        ) : (
          <div className="w-9 h-9 rounded-lg bg-white/[0.07] border border-white/[0.12] flex items-center justify-center mb-2">
            <Upload size={16} className="text-surface-500" />
          </div>
        )}
        <span className="text-[11px] text-surface-500 font-medium">
          {loading ? 'Processing...' : (multiple ? 'Click or drop images' : 'Click or drop image')}
        </span>
        <input ref={inputRef} type="file" accept="image/*" multiple={multiple} className="hidden" onChange={handleInputChange} />
      </div>
    </div>
  );
}

// ─── Generated Image Result ─────────────────────────────────────
export function ImageResult({ image, text, filename = 'generated.png' }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  if (!image) return null;
  const imgSrc = imageToDataUrl(image.base64, image.mimeType);
  return (
    <div className="animate-slide-up">
      {lightboxOpen && <ImageLightbox src={imgSrc} name={text || ''} onClose={() => setLightboxOpen(false)} />}
      <div className="image-card">
        <div className="relative group cursor-pointer" onClick={() => setLightboxOpen(true)}>
          <img src={imgSrc} alt="Generated" className="w-full" />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-300" />
          <div className="absolute top-3 right-3 rounded-lg p-2 opacity-0 group-hover:opacity-100 transition-all duration-200"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
          >
            <Maximize2 size={14} className="text-white" />
          </div>
        </div>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.14)' }}>
          {text && <p className="text-[11px] text-surface-500 truncate flex-1 mr-3">{text}</p>}
          <button
            onClick={(e) => { e.stopPropagation(); downloadImage(image.base64, image.mimeType, filename); }}
            className="btn-ghost px-3 py-1.5 rounded-lg text-white text-[11px] font-semibold flex items-center gap-1.5 shrink-0"
          >
            <Download size={12} /> Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Error Banner ───────────────────────────────────────────────
export function ErrorBanner({ error, onDismiss }) {
  if (!error) return null;
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl text-[13px] animate-slide-up mb-4"
      style={{ 
        background: 'rgba(220,38,38,0.06)', 
        border: '1px solid rgba(220,38,38,0.12)',
        color: '#f87171'
      }}
    >
      <AlertCircle size={15} className="shrink-0" />
      <span className="flex-1">{error}</span>
      <button onClick={onDismiss} className="text-[11px] opacity-50 hover:opacity-100 font-semibold transition-opacity">Dismiss</button>
    </div>
  );
}

// ─── Loading Button ─────────────────────────────────────────────
export function LoadingButton({ onClick, disabled, loading, icon: Icon, label, loadingLabel, className = 'btn-accent' }) {
  return (
    <button onClick={onClick} disabled={disabled || loading} className={`${className} px-5 py-2.5 rounded-lg text-[13px] font-semibold flex items-center justify-center gap-2 transition-all`}>
      {loading ? <><div className="spinner" /> {loadingLabel || 'Processing...'}</> : <>{Icon && <Icon size={15} />} {label}</>}
    </button>
  );
}

// ─── Skeleton Loader ────────────────────────────────────────────
export function SkeletonLoader({ lines = 1, className = '' }) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton-line" style={{ width: `${85 - i * 12}%`, animationDelay: `${i * 80}ms` }} />
      ))}
    </div>
  );
}

export function SkeletonImage({ aspectRatio = '16/9', className = '' }) {
  return (
    <div className={`skeleton-image ${className}`} style={{ aspectRatio }}>
      <div className="skeleton-shimmer" />
    </div>
  );
}

// ─── Toast Notification ─────────────────────────────────────────
export function Toast({ message, visible, onHide }) {
  if (!visible) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[900] text-white text-[13px] font-semibold px-5 py-3 rounded-xl animate-slide-up flex items-center gap-3"
      style={{ 
        background: 'rgba(22,22,22,0.92)', 
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(16,185,129,0.25)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
      }}
    >
      <div className="w-5 h-5 rounded-full bg-accent/15 flex items-center justify-center">
        <Check size={11} className="text-accent" />
      </div>
      {message}
      <button onClick={onHide} aria-label="Dismiss notification" className="text-surface-500 hover:text-white transition-colors ml-1">
        <X size={13} />
      </button>
    </div>
  );
}
