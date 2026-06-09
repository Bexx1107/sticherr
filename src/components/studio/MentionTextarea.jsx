import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Users, Package, Badge } from 'lucide-react';

const TYPE_ICONS = { character: Users, asset: Package, logo: Badge, reference: Package };
const TYPE_COLORS = {
  character: 'text-accent',
  asset: 'text-cyan',
  logo: 'text-white',
  reference: 'text-mint',
};
const HIGHLIGHT_CSS = {
  character: { color: '#10B981', background: 'rgba(16,185,129,0.12)' },
  asset: { color: '#22d3ee', background: 'rgba(34,211,238,0.12)' },
  logo: { color: '#ffffff', background: 'rgba(255,255,255,0.10)' },
  reference: { color: '#34D399', background: 'rgba(52,211,153,0.12)' },
};

export default function MentionTextarea({ value, onChange, entities, placeholder, rows = 4, className = '', onSubmit }) {
  const [showMenu, setShowMenu] = useState(false);
  const [menuFilter, setMenuFilter] = useState('');
  const [menuIndex, setMenuIndex] = useState(0);
  const [mentionStart, setMentionStart] = useState(-1);
  const textareaRef = useRef(null);
  const backdropRef = useRef(null);
  const menuRef = useRef(null);

  // Filter entities by current search
  const filtered = useMemo(() => entities.filter(e =>
    e.name.toLowerCase().includes(menuFilter.toLowerCase())
  ), [entities, menuFilter]);

  // Build set of known entity names for highlighting
  const entityNames = useMemo(() =>
    new Set(entities.map(e => e.name).filter(Boolean)),
    [entities]
  );
  const entityTypeMap = useMemo(() => {
    const m = {};
    for (const e of entities) { if (e.name) m[e.name] = e.type || 'reference'; }
    return m;
  }, [entities]);

  // Build highlighted HTML from value
  const highlightedHtml = useMemo(() => {
    if (!value || entityNames.size === 0) return (value || '') + '\n';
    // Escape HTML, then replace @mentions with colored spans
    const escaped = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // Match @name patterns — names can contain letters, digits, spaces, #
    const result = escaped.replace(/@([\w\s#]+)/g, (match, name) => {
      const trimmed = name.trimEnd();
      // Find longest matching entity name from start
      let bestMatch = null;
      for (const eName of entityNames) {
        if (trimmed === eName || trimmed.startsWith(eName)) {
          if (!bestMatch || eName.length > bestMatch.length) bestMatch = eName;
        }
      }
      if (bestMatch) {
        const type = entityTypeMap[bestMatch] || 'reference';
        const css = HIGHLIGHT_CSS[type] || HIGHLIGHT_CSS.reference;
        const rest = name.slice(bestMatch.length);
        return `<span style="color:${css.color};background:${css.background};border-radius:3px;padding:0 2px">@${bestMatch}</span>${rest}`;
      }
      return match;
    });
    return result + '\n'; // trailing newline to match textarea scroll
  }, [value, entityNames, entityTypeMap]);

  // Sync scroll between textarea and backdrop
  const syncScroll = useCallback(() => {
    if (backdropRef.current && textareaRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop;
      backdropRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  // Reset index when filter changes
  useEffect(() => { setMenuIndex(0); }, [menuFilter]);

  // Close menu on outside click
  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target) && e.target !== textareaRef.current) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const insertMention = useCallback((entity) => {
    const before = value.slice(0, mentionStart);
    const after = value.slice(textareaRef.current?.selectionStart ?? mentionStart);
    const mention = `@${entity.name} `;
    const newValue = before + mention + after;
    onChange(newValue);
    setShowMenu(false);
    setMenuFilter('');
    setMentionStart(-1);

    // Restore cursor after React re-render
    setTimeout(() => {
      const pos = before.length + mention.length;
      textareaRef.current?.setSelectionRange(pos, pos);
      textareaRef.current?.focus();
    }, 0);
  }, [value, mentionStart, onChange]);

  const handleKeyDown = useCallback((e) => {
    // Ctrl+Enter / Cmd+Enter to submit
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      onSubmit?.();
      return;
    }
    if (!showMenu || !filtered.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setMenuIndex(i => (i + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setMenuIndex(i => (i - 1 + filtered.length) % filtered.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      insertMention(filtered[menuIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowMenu(false);
    }
  }, [showMenu, filtered, menuIndex, insertMention, onSubmit]);

  const handleChange = useCallback((e) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart;
    onChange(newValue);

    // Check if we're in a @mention context
    const textBeforeCursor = newValue.slice(0, cursorPos);
    const lastAt = textBeforeCursor.lastIndexOf('@');

    if (lastAt !== -1) {
      const textAfterAt = textBeforeCursor.slice(lastAt + 1);
      // Only show menu if there's no space break (we're still typing the mention)
      // Allow spaces in names (e.g. "Car #1")
      const hasNewline = textAfterAt.includes('\n');
      if (!hasNewline && entities.length > 0) {
        setMentionStart(lastAt);
        setMenuFilter(textAfterAt);
        setShowMenu(true);
        return;
      }
    }
    setShowMenu(false);
  }, [onChange, entities.length]);

  return (
    <div className="relative">
      {/* Highlight backdrop — same font/size as textarea, renders colored @mentions */}
      <div
        ref={backdropRef}
        aria-hidden="true"
        className={`input-field font-mono pointer-events-none whitespace-pre-wrap break-words overflow-hidden ${className}`}
        style={{
          position: 'absolute', inset: 0,
          color: 'rgba(255,255,255,0.85)',
          zIndex: 0,
        }}
        dangerouslySetInnerHTML={{ __html: highlightedHtml }}
      />
      {/* Transparent textarea on top */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onScroll={syncScroll}
        rows={rows}
        placeholder={placeholder}
        className={`input-field font-mono ${className}`}
        style={{
          position: 'relative', zIndex: 1,
          background: 'transparent',
          color: 'transparent',
          caretColor: '#fff',
        }}
      />

      {/* @mention dropdown */}
      {showMenu && filtered.length > 0 && (() => {
        const rect = textareaRef.current?.getBoundingClientRect();
        const flipBelow = rect && rect.top < 250;
        return (
        <div
          ref={menuRef}
          className="absolute z-50 left-0 right-0 bg-surface-800 border border-white/[0.14] rounded-lg shadow-2xl overflow-hidden animate-fade-in backdrop-blur-xl"
          style={flipBelow ? { top: '100%', marginTop: '4px' } : { bottom: '100%', marginBottom: '4px' }}
        >
          <div className="px-3 py-2 border-b border-white/[0.12]">
            <span className="text-[11px] text-surface-500 font-bold uppercase tracking-wider">
              @ Mention — {filtered.length} match{filtered.length !== 1 ? 'es' : ''}
            </span>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.map((entity, i) => {
              const Icon = TYPE_ICONS[entity.type] || Package;
              const color = TYPE_COLORS[entity.type] || 'text-surface-300';
              return (
                <button
                  key={`${entity.type}-${entity.name}-${i}`}
                  onClick={() => insertMention(entity)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                    i === menuIndex ? 'bg-accent/10 text-white' : 'text-surface-300 hover:bg-surface-700/30'
                  }`}
                >
                  {entity.thumbnail && (
                    <img src={entity.thumbnail} alt="" className="w-8 h-8 rounded-lg object-cover border border-white/[0.12] shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold truncate">{entity.name}</div>
                    <div className={`text-[11px] font-semibold uppercase tracking-wider ${color}`}>
                      {entity.type}
                    </div>
                  </div>
                  <Icon size={14} className={`shrink-0 ${color}`} />
                </button>
              );
            })}
          </div>
          <div className="px-3 py-1.5 border-t border-white/[0.12] bg-surface-900/30">
            <span className="text-[11px] text-surface-500">↑↓ navigate · Enter select · Esc close</span>
          </div>
        </div>
      );})()}
    </div>
  );
}
