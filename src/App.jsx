import { useState, useEffect } from 'react';
import { Sparkles, Scissors, HelpCircle, ChevronLeft, ChevronRight, Sun, Moon, X, Menu, AlertTriangle } from 'lucide-react';
import StitcherSubTab from './components/studio/StitcherSubTab';
import { ApiKeyInput } from './components/Shared';

export default function App() {
  const [apiProvider, setApiProvider] = useState(() => {
    return localStorage.getItem('sticherr_api_provider') || 'floyo';
  });
  const [apiKey, setApiKey] = useState(() => {
    const stored = localStorage.getItem('dmd_api_key') || localStorage.getItem('sticherr_api_key') || '';
    return stored.trim().replace(/['"\s]/g, '');
  });
  const [geminiApiKey, setGeminiApiKey] = useState(() => {
    const stored = localStorage.getItem('sticherr_gemini_api_key') || '';
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
  const [showGuide, setShowGuide] = useState(() => {
    return localStorage.getItem('dmd_guide_dismissed') !== 'true';
  });
  const [showMobileNotice, setShowMobileNotice] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setShowMobileNotice(true);
      const timer = setTimeout(() => {
        setShowMobileNotice(false);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('dmd_theme', nextTheme);
  };

  const dismissGuide = () => {
    setShowGuide(false);
    localStorage.setItem('dmd_guide_dismissed', 'true');
  };

  const handleSetApiKey = (key) => {
    const cleaned = (key || '').trim().replace(/['"\s]/g, '');
    setApiKey(cleaned);
    localStorage.setItem('dmd_api_key', cleaned);
    localStorage.setItem('sticherr_api_key', cleaned);
  };

  const handleSetGeminiApiKey = (key) => {
    const cleaned = (key || '').trim().replace(/['"\s]/g, '');
    setGeminiApiKey(cleaned);
    localStorage.setItem('sticherr_gemini_api_key', cleaned);
  };

  const handleSetApiProvider = (provider) => {
    setApiProvider(provider);
    localStorage.setItem('sticherr_api_provider', provider);
  };

  return (
    <div className="h-dvh flex text-surface-100 overflow-hidden bg-surface-950">
      {/* Mobile Drawer Backdrop */}
      {!isSidebarCollapsed && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 md:hidden"
          onClick={() => setIsSidebarCollapsed(true)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className="sidebar-panel shrink-0 flex flex-col z-40 border-r border-white/[0.08] relative transition-all duration-300 ease-in-out"
        style={{ 
          width: isSidebarCollapsed ? '0px' : '280px'
        }}
      >
        {/* Desktop Toggle Button */}
        <button
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="hidden md:flex absolute -right-4 top-7 w-8 h-8 rounded-full border border-mint/40 bg-slate-950 text-mint hover:text-mint-light hover:border-mint hover:bg-mint/5 items-center justify-center z-30 shadow-[0_0_12px_rgba(52,211,153,0.25)] hover:shadow-[0_0_18px_rgba(52,211,153,0.5)] active:scale-90 cursor-pointer transition-all duration-200"
          title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isSidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>

        {/* Sidebar Content (hidden when collapsed) */}
        <div className={`flex flex-col h-full w-[280px] overflow-hidden transition-opacity duration-200 ${isSidebarCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
          {/* Brand */}
          <div className="flex items-center justify-between px-5 py-4 shrink-0">
            <div className="flex items-center" style={{ gap: '8px' }}>
              <div 
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ 
                  background: 'linear-gradient(135deg, #047857, #10B981)', 
                  boxShadow: '0 2px 8px rgba(16,185,129,0.25)' 
                }}
              >
                <Scissors size={16} className="text-white" />
              </div>
              <div>
                <h1 className="text-base font-bold text-white tracking-tight leading-none">Sticherr</h1>
                <p className="text-[10px] font-medium text-surface-500 mt-0.5 tracking-wide uppercase">Editor</p>
              </div>
            </div>

            {/* Mobile Close Button */}
            <button
              onClick={() => setIsSidebarCollapsed(true)}
              className="md:hidden p-1.5 rounded-lg text-surface-400 hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer"
              title="Close sidebar"
            >
              <X size={18} />
            </button>
          </div>

          {/* Separator */}
          <div className="h-px bg-white/[0.10]" style={{ margin: '12px 20px' }} />

          {/* Configurations */}
          <div className="flex-1 p-5 overflow-y-auto flex flex-col gap-4">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="flex items-center gap-2 w-full px-4 py-2.5 rounded-xl text-[12px] font-semibold text-surface-400 hover:text-surface-100 border border-surface-600/15 hover:border-surface-600/30 hover:bg-surface-800/30 transition-all cursor-pointer"
            >
              {theme === 'dark' ? <Sun size={14} className="text-mint" /> : <Moon size={14} className="text-mint" />}
              {theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            </button>

            {/* API Key */}
            <ApiKeyInput 
              apiKey={apiKey} 
              setApiKey={handleSetApiKey} 
              geminiApiKey={geminiApiKey}
              setGeminiApiKey={handleSetGeminiApiKey}
              apiProvider={apiProvider}
              setApiProvider={handleSetApiProvider}
              compact={false} 
            />

            {/* Workspace Guide */}
            {showGuide && (
            <div className="workspace-guide-card rounded-xl border border-mint/20 bg-slate-950/40 p-m3-md flex flex-col gap-m3-md shadow-lg">
              <div className="flex items-center gap-2 text-white font-extrabold text-xs uppercase tracking-wider">
                <HelpCircle size={14} className="text-mint" />
                <span className="flex-1">Workspace Guide</span>
                <button
                  onClick={dismissGuide}
                  className="p-1 rounded-md text-surface-500 hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer"
                  title="Dismiss guide"
                >
                  <X size={12} />
                </button>
              </div>
              
              {/* Steps */}
              <div className="flex flex-col gap-3.5">
                <div className="flex gap-2">
                  <span className="step-number-pill flex items-center justify-center w-5 h-5 rounded-md bg-mint/10 border border-mint/30 text-[10px] text-mint font-extrabold shrink-0 mt-0.5">1</span>
                  <div className="text-[11px] leading-tight">
                    <b className="text-white block font-semibold">Upload Image</b>
                    <span className="text-surface-400">Select a base source image in card 1.</span>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <span className="step-number-pill flex items-center justify-center w-5 h-5 rounded-md bg-mint/10 border border-mint/30 text-[10px] text-mint font-extrabold shrink-0 mt-0.5">2</span>
                  <div className="text-[11px] leading-tight">
                    <b className="text-white block font-semibold">Select Edit Area</b>
                    <span className="text-surface-400">Click and drag on the canvas to define your editing bounds.</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <span className="step-number-pill flex items-center justify-center w-5 h-5 rounded-md bg-mint/10 border border-mint/30 text-[10px] text-mint font-extrabold shrink-0 mt-0.5">3</span>
                  <div className="text-[11px] leading-tight">
                    <b className="text-white block font-semibold">Prompt & Run</b>
                    <span className="text-surface-400">Write instructions (mention <span className="text-mint font-mono">@ref</span> names) in card 2 and generate edits in card 3.</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <span className="step-number-pill flex items-center justify-center w-5 h-5 rounded-md bg-mint/10 border border-mint/30 text-[10px] text-mint font-extrabold shrink-0 mt-0.5">4</span>
                  <div className="text-[11px] leading-tight">
                    <b className="text-white block font-semibold">Refine Layer</b>
                    <span className="text-surface-400">Mask (brush/erase) generated layers and tweak feathering or opacity in card 4.</span>
                  </div>
                </div>
              </div>
            </div>
            )}
            {!showGuide && (
              <button
                onClick={() => { setShowGuide(true); localStorage.removeItem('dmd_guide_dismissed'); }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] text-surface-400 hover:text-white hover:bg-white/[0.04] transition-all cursor-pointer"
              >
                <HelpCircle size={13} className="text-mint" /> Show Guide
              </button>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 text-[10px] text-surface-500 font-medium select-none">
            Sticherr v1.2
          </div>
        </div>
      </aside>

      {/* Main Workspace */}
      <main className="main-workspace flex-1 flex flex-col min-h-0 relative z-10 w-full overflow-hidden">
        {/* Mobile Header Bar */}
        <header className="mobile-app-header flex md:hidden items-center justify-between px-4 py-2.5 bg-surface-950/90 backdrop-blur-md border-b border-white/[0.08] shrink-0 z-20">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setIsSidebarCollapsed(false)}
              className="p-2 rounded-lg text-surface-300 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer border border-white/10"
              aria-label="Open settings menu"
            >
              <Menu size={18} />
            </button>
            <div className="flex items-center gap-2">
              <div 
                className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                style={{ background: 'linear-gradient(135deg, #047857, #10B981)' }}
              >
                <Scissors size={13} className="text-white" />
              </div>
              <span className="text-sm font-bold text-white tracking-tight">Sticherr</span>
            </div>
          </div>
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg text-surface-300 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer border border-white/10"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={15} className="text-mint" /> : <Moon size={15} className="text-mint" />}
          </button>
        </header>

        {/* Mobile Disclaimer Toast (auto-dismisses) */}
        {showMobileNotice && (
          <div className="md:hidden fixed top-14 left-3 right-3 z-50 flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-surface-900/95 border border-amber-500/40 text-surface-200 text-xs shadow-2xl backdrop-blur-md animate-slide-up">
            <div className="flex items-center gap-2.5">
              <AlertTriangle size={15} className="text-amber-400 shrink-0" />
              <span className="leading-snug">
                Mobile experience might feel a bit limited or broken — please switch to <strong className="text-white">desktop mode</strong> for the best experience!
              </span>
            </div>
            <button
              onClick={() => setShowMobileNotice(false)}
              className="text-surface-400 hover:text-surface-100 p-1 cursor-pointer shrink-0 text-xs font-bold"
              aria-label="Dismiss disclaimer"
            >
              ✕
            </button>
          </div>
        )}

        <StitcherSubTab 
          apiKey={apiProvider === 'gemini' ? geminiApiKey : apiKey} 
          theme={theme} 
          apiProvider={apiProvider}
          geminiApiKey={geminiApiKey}
        />
      </main>
    </div>
  );
}
