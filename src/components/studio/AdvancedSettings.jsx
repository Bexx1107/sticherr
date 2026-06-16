import { useState } from 'react';
import { ChevronDown, ChevronRight, Settings2, RotateCcw } from 'lucide-react';

// Default values matching actual image generation parameters
export const ADVANCED_DEFAULTS = {
  seed: '',              // empty = random (-1)
  safetyTolerance: '4',  // '1' (strictest/Block Most) to '4' (most permissive/Allow Most)
  enableWebSearch: false,
};

// Get a clean config object for the API call
export function getAdvancedConfig(settings) {
  const config = {};
  if (settings.seed !== '' && settings.seed !== null && settings.seed !== undefined) {
    config.seed = parseInt(settings.seed, 10);
  } else {
    config.seed = -1;
  }
  config.safetyTolerance = settings.safetyTolerance || '4';
  config.enableWebSearch = !!settings.enableWebSearch;
  return config;
}

// Hook for managing advanced settings state
export function useAdvancedSettings() {
  const [seed, setSeed] = useState(ADVANCED_DEFAULTS.seed);
  const [safetyTolerance, setSafetyTolerance] = useState(ADVANCED_DEFAULTS.safetyTolerance);
  const [enableWebSearch, setEnableWebSearch] = useState(ADVANCED_DEFAULTS.enableWebSearch);

  const settings = { seed, safetyTolerance, enableWebSearch };

  const reset = () => {
    setSeed(ADVANCED_DEFAULTS.seed);
    setSafetyTolerance(ADVANCED_DEFAULTS.safetyTolerance);
    setEnableWebSearch(ADVANCED_DEFAULTS.enableWebSearch);
  };

  const isModified = 
    seed !== ADVANCED_DEFAULTS.seed ||
    safetyTolerance !== ADVANCED_DEFAULTS.safetyTolerance ||
    enableWebSearch !== ADVANCED_DEFAULTS.enableWebSearch;

  return {
    settings,
    setSeed, setSafetyTolerance, setEnableWebSearch,
    reset,
    isModified,
  };
}

// ─── The Advanced Settings Panel Component ──────────────────────
export default function AdvancedSettings({ settings, setSeed, setSafetyTolerance, setEnableWebSearch, reset, isModified }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="advanced-settings-panel">
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between px-m3-md py-m3-sm rounded-xl border transition-all duration-200 text-xs font-bold cursor-pointer ${
          open 
            ? 'bg-slate-900 border-mint/35 text-white shadow-sm' 
            : 'bg-slate-900/50 border-white/10 text-surface-300 hover:bg-slate-900 hover:text-white hover:border-white/20'
        }`}
      >
        <div className="flex items-center gap-m3-sm">
          <Settings2 size={14} className={isModified ? 'text-mint' : 'text-surface-400'} />
          <span>Advanced Generation Config</span>
          {isModified && <span className="badge badge-accent text-[9px] px-2 py-0.5 bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/40">Modified</span>}
        </div>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>

      {open && (
        <div className="mt-m3-sm space-y-m3-md p-m3-md rounded-xl bg-slate-950/80 border border-white/10 shadow-lg animate-fade-in">
          {/* Reset button */}
          {isModified && (
            <button onClick={reset}
              className="flex items-center gap-m3-xs text-[11px] font-bold text-surface-400 hover:text-mint transition-colors ml-auto cursor-pointer">
              <RotateCcw size={12} /> Reset to defaults
            </button>
          )}

          {/* Seed Input */}
          <div className="space-y-m3-xs">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-surface-400 uppercase tracking-wider font-extrabold">Seed</label>
              {settings.seed !== '' && (
                <button onClick={() => setSeed('')} className="text-[10px] font-bold text-surface-400 hover:text-red-400 transition-colors cursor-pointer">
                  Clear
                </button>
              )}
            </div>
            <div className="relative">
              <input
                type="number" min="0" step="1"
                value={settings.seed}
                onChange={e => setSeed(e.target.value)}
                placeholder="Random (empty)"
                className="input-field font-mono text-xs w-full pr-20 bg-black/40 border border-white/10 rounded-lg p-2.5 text-white outline-none focus:border-mint/50"
              />
              <button
                type="button"
                onClick={() => setSeed(Math.floor(Math.random() * 2147483647).toString())}
                className="absolute right-1 top-1 bottom-1 px-3 text-[10px] font-extrabold rounded-md bg-white/[0.08] hover:bg-white/[0.15] text-white transition-all cursor-pointer border border-white/10"
              >
                🎲 Random
              </button>
            </div>
            <p className="text-[9px] text-surface-500">Set a specific seed value for reproducible edit generation.</p>
          </div>

          {/* Safety Tolerance Select Buttons */}
          <div className="space-y-m3-xs">
            <label className="text-[10px] text-surface-400 uppercase tracking-wider font-extrabold block">
              Safety Block Threshold
            </label>
            <div className="grid grid-cols-4 gap-m3-sm p-m3-xs rounded-lg bg-black/40 border border-white/10">
              {['1', '2', '3', '4'].map(val => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setSafetyTolerance(val)}
                  className={`py-1.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                    settings.safetyTolerance === val
                      ? 'bg-mint/20 text-white border border-mint/45 shadow-sm'
                      : 'text-surface-400 hover:text-white hover:bg-white/[0.04] border border-transparent'
                  }`}
                >
                  {val === '1' ? 'Block Most' : val === '2' ? 'High' : val === '3' ? 'Medium' : 'Allow Most'}
                </button>
              ))}
            </div>
            <p className="text-[9px] text-surface-500">Configures content filtering strictness for generated outputs.</p>
          </div>

          {/* Web Search Grounding Toggle */}
          <div className="flex items-center justify-between p-m3-md rounded-xl bg-black/40 border border-white/10">
            <div className="space-y-0.5 pr-2">
              <label className="text-[11px] font-bold text-white block">Web Search Grounding</label>
              <span className="text-[9px] text-surface-500 block leading-tight">Enables live Google search results to guide prompt generation</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input 
                type="checkbox" 
                checked={settings.enableWebSearch} 
                onChange={e => setEnableWebSearch(e.target.checked)}
                className="sr-only peer" 
              />
              <div className="w-9 h-5 bg-white/[0.10] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-surface-400 after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-mint peer-checked:after:bg-slate-950 peer-checked:after:border-transparent"></div>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
