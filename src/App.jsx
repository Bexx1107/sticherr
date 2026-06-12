import { useState } from 'react';
import { Sparkles, Scissors, HelpCircle, ChevronLeft, ChevronRight } from 'lucide-react';
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

  const handleSetApiKey = (key) => {
    const cleaned = (key || '').trim().replace(/['"\s]/g, '');
    setApiKey(cleaned);
    localStorage.setItem('dmd_api_key', cleaned);
  };

  return (
    <div className="h-dvh flex text-surface-100 overflow-hidden" style={{ background: '#020617' }}>
      {/* Sidebar */}
      <aside 
        className="shrink-0 flex flex-col z-20 border-r border-white/[0.08] relative transition-all duration-300 ease-in-out"
        style={{ 
          width: isSidebarCollapsed ? '0px' : '280px',
          background: 'linear-gradient(180deg, rgba(15,23,42,0.95) 0%, rgba(2,6,23,0.98) 100%)' 
        }}
      >
        {/* Toggle Button */}
        <button
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="absolute -right-4 top-7 w-8 h-8 rounded-full border border-white/[0.08] bg-slate-900 text-surface-300 hover:text-white flex items-center justify-center z-30 shadow-md cursor-pointer transition-colors"
          title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isSidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>

        {/* Sidebar Content (hidden when collapsed) */}
        <div className={`flex flex-col h-full w-[280px] overflow-hidden transition-opacity duration-200 ${isSidebarCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
          {/* Brand */}
          <div className="flex items-center px-m3-ml py-m3-ml shrink-0">
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

          {/* Separator */}
          <div className="mx-m3-md h-px bg-white/[0.10]" />

          {/* Configurations */}
          <div className="flex-1 p-m3-ml overflow-y-auto space-y-m3-ml">
            {/* API Key */}
            <ApiKeyInput apiKey={apiKey} setApiKey={handleSetApiKey} compact={false} />

            {/* Quick Help */}
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-m3-md space-y-m3-ms">
              <div className="flex items-center gap-m3-sm text-surface-300 font-semibold text-xs">
                <HelpCircle size={14} className="text-mint" />
                <span>Workspace Help</span>
              </div>
              <p className="text-[11px] text-surface-400 leading-relaxed">
                Upload a source image, draw an edit mask, specify a prompt, and hit generate. 
                The editor lets you layer multiple edit results over the base image.
              </p>
              <div className="text-[10px] text-surface-500 space-y-m3-xs pt-m3-xs">
                <div>• <b>Space + Drag</b> to pan the canvas</div>
                <div>• <b>Ctrl + S</b> to save project</div>
                <div>• <b>Scroll</b> to zoom in/out</div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-m3-ml border-t border-white/[0.08] text-[10px] text-surface-500 font-medium">
            Stand-alone App v1.0.0
          </div>
        </div>
      </aside>

      {/* Main Workspace */}
      <main className="flex-1 flex flex-col min-h-0 relative z-10 w-full overflow-hidden"
        style={{ background: 'rgba(2,6,23,0.4)' }}
      >
        <StitcherSubTab apiKey={apiKey} />
      </main>
    </div>
  );
}
