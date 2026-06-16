import { useState, useEffect } from 'react';
import { Sparkles, Scissors, HelpCircle, ChevronLeft, ChevronRight, Sun, Moon } from 'lucide-react';
import StitcherSubTab from './components/studio/StitcherSubTab';
import { ApiKeyInput } from './components/Shared';

export default function App() {
  const [apiKey, setApiKey] = useState(() => {
    const stored = localStorage.getItem('dmd_api_key') || '';
    return stored.trim().replace(/['"\s]/g, '');
  });
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 768;
    }
    return false;
  });
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('dmd_theme') || 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('dmd_theme', nextTheme);
  };

  const handleSetApiKey = (key) => {
    const cleaned = (key || '').trim().replace(/['"\s]/g, '');
    setApiKey(cleaned);
    localStorage.setItem('dmd_api_key', cleaned);
  };

  return (
    <div className="h-dvh flex text-surface-100 overflow-hidden bg-surface-950">
      {/* Sidebar */}
      <aside 
        className="sidebar-panel shrink-0 flex flex-col z-20 border-r border-white/[0.08] relative transition-all duration-300 ease-in-out"
        style={{ 
          width: isSidebarCollapsed ? '0px' : '280px'
        }}
      >
        {/* Toggle Button */}
        <button
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="absolute -right-4 top-7 w-8 h-8 rounded-full border border-mint/40 bg-slate-950 text-mint hover:text-mint-light hover:border-mint hover:bg-mint/5 flex items-center justify-center z-30 shadow-[0_0_12px_rgba(52,211,153,0.25)] hover:shadow-[0_0_18px_rgba(52,211,153,0.5)] active:scale-90 cursor-pointer transition-all duration-200"
          title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isSidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>

        {/* Sidebar Content (hidden when collapsed) */}
        <div className={`flex flex-col h-full w-[280px] overflow-hidden transition-opacity duration-200 ${isSidebarCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
          {/* Brand */}
          <div className="flex flex-col gap-m3-sm px-m3-ml py-m3-ml shrink-0">
            <div className="flex items-center">
              <div 
                className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg"
                style={{ 
                  background: 'linear-gradient(135deg, #047857, #10B981)', 
                  boxShadow: '0 4px 20px rgba(16,185,129,0.3), inset 0 1px 0 rgba(255,255,255,0.15)' 
                }}
              >
                <Scissors size={20} className="text-white" />
              </div>
              <div className="ml-m3-ms">
                <h1 className="text-base font-bold text-white tracking-tight leading-none">Sticherr</h1>
                <p className="text-[10px] font-medium text-surface-500 mt-0.5 tracking-wide uppercase">Standalone Editor</p>
              </div>
            </div>

            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className="w-full mt-2 py-2 px-3 rounded-lg bg-white/[0.04] border border-white/10 hover:border-mint/30 hover:bg-mint/5 text-[11px] font-semibold text-surface-300 hover:text-white flex items-center justify-center gap-1.5 cursor-pointer transition-all duration-150 shadow-sm"
              title={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {theme === 'dark' ? (
                <><Sun size={12} className="text-mint animate-pulse" /> Switch to Light Mode</>
              ) : (
                <><Moon size={12} className="text-mint" /> Switch to Dark Mode</>
              )}
            </button>
          </div>

          {/* Separator */}
          <div className="mx-m3-md h-px bg-white/[0.10]" />

          {/* Configurations */}
          <div className="flex-1 p-m3-ml overflow-y-auto flex flex-col gap-m3-ml">
            {/* API Key */}
            <ApiKeyInput apiKey={apiKey} setApiKey={handleSetApiKey} compact={false} />

            {/* Workspace Guide */}
            <div className="rounded-xl border border-mint/20 bg-slate-950/40 p-m3-md flex flex-col gap-m3-md shadow-lg">
              <div className="flex items-center gap-2 text-white font-extrabold text-xs uppercase tracking-wider">
                <HelpCircle size={14} className="text-mint" />
                <span>Workspace Guide</span>
              </div>
              
              {/* Steps */}
              <div className="flex flex-col gap-3.5">
                <div className="flex gap-2">
                  <span className="flex items-center justify-center w-5 h-5 rounded-md bg-mint/10 border border-mint/30 text-[10px] text-mint font-extrabold shrink-0 mt-0.5">1</span>
                  <div className="text-[11px] leading-tight">
                    <b className="text-white block font-semibold">Upload Image</b>
                    <span className="text-surface-400">Select a base source image in card 1.</span>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <span className="flex items-center justify-center w-5 h-5 rounded-md bg-mint/10 border border-mint/30 text-[10px] text-mint font-extrabold shrink-0 mt-0.5">2</span>
                  <div className="text-[11px] leading-tight">
                    <b className="text-white block font-semibold">Select Edit Area</b>
                    <span className="text-surface-400">Click and drag on the canvas to define your editing bounds.</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <span className="flex items-center justify-center w-5 h-5 rounded-md bg-mint/10 border border-mint/30 text-[10px] text-mint font-extrabold shrink-0 mt-0.5">3</span>
                  <div className="text-[11px] leading-tight">
                    <b className="text-white block font-semibold">Prompt & Run</b>
                    <span className="text-surface-400">Write instructions (mention <span className="text-mint font-mono">@ref</span> names) in card 2 and generate edits in card 3.</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <span className="flex items-center justify-center w-5 h-5 rounded-md bg-mint/10 border border-mint/30 text-[10px] text-mint font-extrabold shrink-0 mt-0.5">4</span>
                  <div className="text-[11px] leading-tight">
                    <b className="text-white block font-semibold">Refine Layer</b>
                    <span className="text-surface-400">Mask (brush/erase) generated layers and tweak feathering or opacity in card 4.</span>
                  </div>
                </div>
              </div>

              {/* Separator */}
              <div className="h-px bg-white/[0.08]" />

              {/* Keyboard Shortcuts */}
              <div className="flex flex-col gap-3">
                <div className="text-[10px] text-surface-400 uppercase tracking-wider font-extrabold">
                  Canvas Shortcuts
                </div>
                
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between text-[11px] text-surface-300">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-mint" /> Pan Canvas
                    </span>
                    <div className="flex items-center gap-1">
                      <kbd className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-slate-950 border border-white/20 text-white shadow-sm">Middle Mouse</kbd>
                      <span>+</span>
                      <span className="text-[10px] font-medium text-surface-400">Drag</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-surface-300">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-mint" /> Zoom Canvas
                    </span>
                    <div className="flex items-center gap-1">
                      <kbd className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-slate-950 border border-white/20 text-white shadow-sm">Scroll</kbd>
                      <span className="text-[10px] text-surface-400">or</span>
                      <kbd className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-slate-950 border border-white/20 text-white shadow-sm">Pinch</kbd>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-surface-300">
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-mint" /> Save Project
                    </span>
                    <div className="flex items-center gap-1">
                      <kbd className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-slate-950 border border-white/20 text-white shadow-sm">Ctrl</kbd>
                      <span>+</span>
                      <kbd className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-slate-950 border border-white/20 text-white shadow-sm">S</kbd>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-m3-ml border-t border-white/[0.08] text-[10px] text-surface-500 font-medium select-none">
            Sticherr v1.2
          </div>
        </div>
      </aside>

      {/* Main Workspace */}
      <main className="main-workspace flex-1 flex flex-col min-h-0 relative z-10 w-full overflow-hidden">
        <StitcherSubTab apiKey={apiKey} theme={theme} />
      </main>
    </div>
  );
}
