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
        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border transition-all duration-200 text-xs font-semibold ${
          open 
            ? 'bg-white/[0.14] border-white/[0.10] text-surface-200' 
            : 'bg-transparent border-white/[0.07] text-surface-500 hover:text-surface-300 hover:border-white/[0.14]'
        }`}
      >
        <div className="flex items-center gap-2">
          <Settings2 size={13} className={isModified ? 'text-accent' : ''} />
          <span>Advanced Settings</span>
          {isModified && <span className="badge badge-accent text-[9px] px-1.5 py-0 bg-emerald-500/20 text-emerald-400">Modified</span>}
        </div>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      </button>

      {open && (
        <div className="mt-2 space-y-4 p-3 rounded-lg bg-white/[0.07] border border-white/[0.07] animate-fade-in">
          {/* Reset button */}
          {isModified && (
            <button onClick={reset}
              className="flex items-center gap-1.5 text-[11px] text-surface-500 hover:text-emerald-400 transition-colors ml-auto">
              <RotateCcw size={11} /> Reset to defaults
            </button>
          )}

          {/* Seed Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] text-surface-400 uppercase tracking-wider font-bold">Seed</label>
              {settings.seed !== '' && (
                <button onClick={() => setSeed('')} className="text-[10px] text-surface-500 hover:text-emerald-400 transition-colors">
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
                className="input-field font-mono text-xs w-full pr-16 bg-black/40 border border-white/[0.12] rounded-lg p-2 text-white outline-none focus:border-emerald-500/40"
              />
              <button
                type="button"
                onClick={() => setSeed(Math.floor(Math.random() * 2147483647).toString())}
                className="absolute right-1 top-1 bottom-1 px-2 text-[9px] font-bold rounded bg-white/[0.08] hover:bg-white/[0.15] text-surface-300 hover:text-white transition-all"
              >
                🎲 Random
              </button>
            </div>
            <p className="text-[9px] text-surface-500 mt-1">Set a seed for reproducible results. Leave empty for random.</p>
          </div>

          {/* Safety Tolerance Select Buttons */}
          <div>
            <label className="text-[11px] text-surface-400 uppercase tracking-wider font-bold block mb-1.5">
              Safety Block Threshold
            </label>
            <div className="grid grid-cols-4 gap-1 p-0.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
              {['1', '2', '3', '4'].map(val => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setSafetyTolerance(val)}
                  className={`py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                    settings.safetyTolerance === val
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'text-surface-400 hover:text-white hover:bg-white/[0.04] border border-transparent'
                  }`}
                >
                  {val === '1' ? 'Block Most' : val === '2' ? 'High' : val === '3' ? 'Medium' : 'Allow Most'}
                </button>
              ))}
            </div>
            <p className="text-[9px] text-surface-500 mt-1">Configures content filtering strictness for generated outputs.</p>
          </div>

          {/* Web Search Grounding Toggle */}
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
            <div>
              <label className="text-[11px] font-bold text-surface-300 block">Web Search Grounding</label>
              <span className="text-[9px] text-surface-500 block">Enables live Google search results to guide prompt generation</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                checked={settings.enableWebSearch} 
                onChange={e => setEnableWebSearch(e.target.checked)}
                className="sr-only peer" 
              />
              <div className="w-9 h-5 bg-white/[0.10] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-surface-400 after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500 peer-checked:after:bg-white peer-checked:after:border-transparent"></div>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
