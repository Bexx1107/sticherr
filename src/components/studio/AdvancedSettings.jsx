import { useState } from 'react';
import { ChevronDown, ChevronRight, Settings2, RotateCcw } from 'lucide-react';

// Default values matching FloUI defaults
export const ADVANCED_DEFAULTS = {
  temperature: 1.0,
  topP: 0.95,
  topK: 64,
  seed: '',              // empty = random
  systemInstruction: '', // empty = none
};

// Get a clean config object for the API call (only includes non-default values)
export function getAdvancedConfig(settings) {
  const config = {};
  if (settings.temperature !== ADVANCED_DEFAULTS.temperature) {
    config.temperature = settings.temperature;
  }
  if (settings.topP !== ADVANCED_DEFAULTS.topP) {
    config.topP = settings.topP;
  }
  if (settings.topK !== ADVANCED_DEFAULTS.topK) {
    config.topK = settings.topK;
  }
  if (settings.seed !== '' && settings.seed !== null && settings.seed !== undefined) {
    config.seed = parseInt(settings.seed, 10);
  }
  if (settings.systemInstruction && settings.systemInstruction.trim()) {
    config.systemInstruction = settings.systemInstruction.trim();
  }
  return config;
}

// Hook for managing advanced settings state
export function useAdvancedSettings() {
  const [temperature, setTemperature] = useState(ADVANCED_DEFAULTS.temperature);
  const [topP, setTopP] = useState(ADVANCED_DEFAULTS.topP);
  const [topK, setTopK] = useState(ADVANCED_DEFAULTS.topK);
  const [seed, setSeed] = useState(ADVANCED_DEFAULTS.seed);
  const [systemInstruction, setSystemInstruction] = useState(ADVANCED_DEFAULTS.systemInstruction);

  const settings = { temperature, topP, topK, seed, systemInstruction };

  const reset = () => {
    setTemperature(ADVANCED_DEFAULTS.temperature);
    setTopP(ADVANCED_DEFAULTS.topP);
    setTopK(ADVANCED_DEFAULTS.topK);
    setSeed(ADVANCED_DEFAULTS.seed);
    setSystemInstruction(ADVANCED_DEFAULTS.systemInstruction);
  };

  const isModified = 
    temperature !== ADVANCED_DEFAULTS.temperature ||
    topP !== ADVANCED_DEFAULTS.topP ||
    topK !== ADVANCED_DEFAULTS.topK ||
    seed !== ADVANCED_DEFAULTS.seed ||
    systemInstruction !== ADVANCED_DEFAULTS.systemInstruction;

  return {
    settings,
    setTemperature, setTopP, setTopK, setSeed, setSystemInstruction,
    reset,
    isModified,
  };
}

// ─── The Advanced Settings Panel Component ──────────────────────
export default function AdvancedSettings({ settings, setTemperature, setTopP, setTopK, setSeed, setSystemInstruction, reset, isModified }) {
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
          {isModified && <span className="badge badge-accent text-[9px] px-1.5 py-0">Modified</span>}
        </div>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      </button>

      {open && (
        <div className="mt-2 space-y-4 p-3 rounded-lg bg-white/[0.07] border border-white/[0.07] animate-fade-in">
          {/* Reset button */}
          {isModified && (
            <button onClick={reset}
              className="flex items-center gap-1.5 text-[11px] text-surface-500 hover:text-accent transition-colors ml-auto">
              <RotateCcw size={11} /> Reset to defaults
            </button>
          )}

          {/* Temperature */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] text-surface-400 uppercase tracking-wider font-bold">Temperature</label>
              <span className="text-[12px] font-mono text-accent font-bold tabular-nums">{settings.temperature.toFixed(2)}</span>
            </div>
            <input
              type="range" min="0" max="2" step="0.05"
              value={settings.temperature}
              onChange={e => setTemperature(parseFloat(e.target.value))}
              className="advanced-slider w-full"
            />
            <div className="flex justify-between text-[9px] text-surface-500 mt-0.5">
              <span>Deterministic</span>
              <span>Creative</span>
            </div>
          </div>

          {/* Top P */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] text-surface-400 uppercase tracking-wider font-bold">Top P</label>
              <span className="text-[12px] font-mono text-accent font-bold tabular-nums">{settings.topP.toFixed(2)}</span>
            </div>
            <input
              type="range" min="0" max="1" step="0.01"
              value={settings.topP}
              onChange={e => setTopP(parseFloat(e.target.value))}
              className="advanced-slider w-full"
            />
            <div className="flex justify-between text-[9px] text-surface-500 mt-0.5">
              <span>Focused</span>
              <span>Diverse</span>
            </div>
          </div>

          {/* Top K */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] text-surface-400 uppercase tracking-wider font-bold">Top K</label>
              <span className="text-[12px] font-mono text-accent font-bold tabular-nums">{settings.topK}</span>
            </div>
            <input
              type="range" min="1" max="100" step="1"
              value={settings.topK}
              onChange={e => setTopK(parseInt(e.target.value, 10))}
              className="advanced-slider w-full"
            />
            <div className="flex justify-between text-[9px] text-surface-500 mt-0.5">
              <span>1</span>
              <span>100</span>
            </div>
          </div>

          {/* Seed */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] text-surface-400 uppercase tracking-wider font-bold">Seed</label>
              {settings.seed !== '' && (
                <button onClick={() => setSeed('')} className="text-[10px] text-surface-500 hover:text-accent transition-colors">
                  Clear
                </button>
              )}
            </div>
            <input
              type="number" min="0" step="1"
              value={settings.seed}
              onChange={e => setSeed(e.target.value)}
              placeholder="Random (empty)"
              className="input-field font-mono text-xs"
            />
            <p className="text-[9px] text-surface-500 mt-1">Set a number for reproducible results. Leave empty for random.</p>
          </div>

          {/* System Instruction */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] text-surface-400 uppercase tracking-wider font-bold">System Instruction</label>
              {settings.systemInstruction && (
                <button onClick={() => setSystemInstruction('')} className="text-[10px] text-surface-500 hover:text-accent transition-colors">
                  Clear
                </button>
              )}
            </div>
            <textarea
              value={settings.systemInstruction}
              onChange={e => setSystemInstruction(e.target.value)}
              rows={3}
              placeholder="e.g. You are a professional anime illustrator. Always use vibrant saturated colors, cel-shading, and thick outlines..."
              className="input-field font-mono text-[11px] leading-relaxed"
            />
            <p className="text-[9px] text-surface-500 mt-1">Persistent style or behavior rules injected before every generation. Enforces consistency across outputs.</p>
          </div>
        </div>
      )}
    </div>
  );
}
