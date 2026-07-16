import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { useHotkey } from '@/hooks/useHotkeys';
import {
    Columns,
    Eraser,
    Plus,
    Rows,
    Skull,
    TerminalSquare,
    X,
    Maximize2,
    Minimize2,
    MoreVertical,
    Copy,
    Clipboard,
    Scissors,
    Square,
  } from 'lucide-react';
import { useTerminalStore } from '@/store/useTerminalStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useProjectStore } from '@/store/useProjectStore';
import { IconButton } from '@/components/shared/IconButton';
import { toast } from '@/store/useNotificationStore';
import '@xterm/xterm/css/xterm.css';
import './TerminalView.css';

/* ------------------------------------------------------------------ */
/*  xterm theme / font helpers                                        */
/* ------------------------------------------------------------------ */

function getXtermTheme(themeName: string) {
  switch (themeName) {
    case 'light':
      return {
        background: '#ffffff', foreground: '#1e2030', cursor: '#2563eb',
        cursorAccent: '#ffffff', selectionBackground: 'rgba(37, 99, 235, 0.2)',
        black: '#1e2030', red: '#dc2626', green: '#0d9488', yellow: '#d97706',
        blue: '#2563eb', magenta: '#7c5cff', cyan: '#0d9488', white: '#ffffff',
        brightBlack: '#8c90aa', brightRed: '#ef4444', brightGreen: '#0d9488',
        brightYellow: '#d97706', brightBlue: '#3b82f6', brightMagenta: '#9b7fff',
        brightCyan: '#0d9488', brightWhite: '#1e2030',
      };
    case 'claude':
      return {
        background: '#ffffff', foreground: '#191919', cursor: '#cc6b49',
        cursorAccent: '#ffffff', selectionBackground: 'rgba(204, 107, 73, 0.2)',
        black: '#191919', red: '#e05a47', green: '#10b981', yellow: '#f59e0b',
        blue: '#2563eb', magenta: '#7c5cff', cyan: '#0d9488', white: '#ffffff',
        brightBlack: '#6b7280', brightRed: '#ef4444', brightGreen: '#10b981',
        brightYellow: '#f59e0b', brightBlue: '#3b82f6', brightMagenta: '#9b7fff',
        brightCyan: '#0d9488', brightWhite: '#191919',
      };
    case 'claude-dark':
      return {
        background: '#181816', foreground: '#f5ede3', cursor: '#e06e43',
        cursorAccent: '#181816', selectionBackground: 'rgba(224, 110, 67, 0.25)',
        black: '#181816', red: '#e05a47', green: '#10b981', yellow: '#f59e0b',
        blue: '#2563eb', magenta: '#7c5cff', cyan: '#0d9488', white: '#f5ede3',
        brightBlack: '#6b6660', brightRed: '#ef4444', brightGreen: '#10b981',
        brightYellow: '#f59e0b', brightBlue: '#3b82f6', brightMagenta: '#9b7fff',
        brightCyan: '#0d9488', brightWhite: '#ffffff',
      };
    case 'nord':
      return {
        background: '#2e3440', foreground: '#d8dee9', cursor: '#88c0d0',
        cursorAccent: '#2e3440', selectionBackground: 'rgba(136, 192, 208, 0.3)',
        black: '#3b4252', red: '#bf616a', green: '#a3be8c', yellow: '#ebcb8b',
        blue: '#81a1c1', magenta: '#b48ead', cyan: '#88c0d0', white: '#e5e9f0',
        brightBlack: '#4c566a', brightRed: '#bf616a', brightGreen: '#a3be8c',
        brightYellow: '#ebcb8b', brightBlue: '#81a1c1', brightMagenta: '#b48ead',
        brightCyan: '#8fbcbb', brightWhite: '#eceff4',
      };
    case 'solarized-dark':
      return {
        background: '#002b36', foreground: '#93a1a1', cursor: '#b58900',
        cursorAccent: '#002b36', selectionBackground: 'rgba(181, 137, 0, 0.25)',
        black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900',
        blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
        brightBlack: '#586e75', brightRed: '#cb4b16', brightGreen: '#586e75',
        brightYellow: '#657b83', brightBlue: '#839496', brightMagenta: '#6c71c4',
        brightCyan: '#93a1a1', brightWhite: '#fdf6e3',
      };
    case 'monokai':
      return {
        background: '#272822', foreground: '#f8f8f2', cursor: '#f92672',
        cursorAccent: '#272822', selectionBackground: 'rgba(249, 38, 114, 0.3)',
        black: '#1e1f1c', red: '#f92672', green: '#a6e22e', yellow: '#e6db74',
        blue: '#66d9ef', magenta: '#ae81ff', cyan: '#a1efe4', white: '#f8f8f2',
        brightBlack: '#75715e', brightRed: '#f92672', brightGreen: '#a6e22e',
        brightYellow: '#e6db74', brightBlue: '#66d9ef', brightMagenta: '#ae81ff',
        brightCyan: '#a1efe4', brightWhite: '#f8f8f2',
      };
    case 'dark-slate':
    default:
      return {
        background: '#0b0f19', foreground: '#f1f5f9', cursor: '#38bdf8',
        cursorAccent: '#0b0f19', selectionBackground: 'rgba(56, 189, 248, 0.25)',
        black: '#111625', red: '#ef4444', green: '#0d9488', yellow: '#f59e0b',
        blue: '#0284c7', magenta: '#38bdf8', cyan: '#0d9488', white: '#f1f5f9',
        brightBlack: '#475569', brightRed: '#ef4444', brightGreen: '#0d9488',
        brightYellow: '#f59e0b', brightBlue: '#0284c7', brightMagenta: '#38bdf8',
        brightCyan: '#0d9488', brightWhite: '#ffffff',
      };
  }
}

const XTERM_FONT_FAMILY = "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace";

/* ------------------------------------------------------------------ */
/*  Split-tree model (every pane can nest arbitrary sub-splits)        */
/* ------------------------------------------------------------------ */

type SplitDir = 'row' | 'col';

type PaneNode =
  | { kind: 'leaf'; sessionId: string }
  | { kind: 'split'; dir: SplitDir; ratio: number; a: PaneNode; b: PaneNode };

const isLeaf = (node: PaneNode): node is { kind: 'leaf'; sessionId: string } =>
  node.kind === 'leaf';

function collectLeaves(node: PaneNode, acc: string[] = []): string[] {
  if (isLeaf(node)) acc.push(node.sessionId);
  else {
    collectLeaves(node.a, acc);
    collectLeaves(node.b, acc);
  }
  return acc;
}

function buildBalancedGrid(ids: string[], dir: SplitDir = 'row'): PaneNode {
  if (ids.length === 0) {
    throw new Error('Cannot build grid with empty ids');
  }
  if (ids.length === 1) {
    return { kind: 'leaf', sessionId: ids[0] };
  }
  const mid = Math.ceil(ids.length / 2);
  const leftIds = ids.slice(0, mid);
  const rightIds = ids.slice(mid);
  const nextDir = dir === 'row' ? 'col' : 'row';
  return {
    kind: 'split',
    dir,
    ratio: 0.5,
    a: buildBalancedGrid(leftIds, nextDir),
    b: buildBalancedGrid(rightIds, nextDir),
  };
}

function containsSession(node: PaneNode, sessionId: string): boolean {
  return collectLeaves(node).includes(sessionId);
}

/** Replace the leaf matching `sessionId` by applying `fn` to it. */
function mapLeaf(node: PaneNode, sessionId: string, fn: (leaf: PaneNode) => PaneNode): PaneNode {
  if (isLeaf(node)) return node.sessionId === sessionId ? fn(node) : node;
  return { ...node, a: mapLeaf(node.a, sessionId, fn), b: mapLeaf(node.b, sessionId, fn) };
}

/** Remove a leaf, collapsing any split that ends up with a single child. */
function removeLeaf(
  node: PaneNode,
  sessionId: string,
): { tree: PaneNode | null; removed: boolean } {
  if (isLeaf(node)) {
    return node.sessionId === sessionId
      ? { tree: null, removed: true }
      : { tree: node, removed: false };
  }
  const a = removeLeaf(node.a, sessionId);
  const b = removeLeaf(node.b, sessionId);
  if (a.removed && a.tree === null) return { tree: b.tree, removed: true };
  if (b.removed && b.tree === null) return { tree: a.tree, removed: true };
  return { tree: { ...node, a: a.tree!, b: b.tree! }, removed: a.removed || b.removed };
}

/** Update the ratio of the split found at `path` (array of 'a'/'b' from root). */
function setRatioAt(node: PaneNode, path: ('a' | 'b')[], ratio: number): PaneNode {
  if (isLeaf(node) || path.length === 0) return node;
  const [head, ...rest] = path;
  if (rest.length === 0) return { ...node, ratio };
  return { ...node, [head]: setRatioAt(node[head], rest, ratio) };
}

/* ------------------------------------------------------------------ */
/*  Terminal Pane (leaf)                                              */
/* ------------------------------------------------------------------ */

function TerminalPane({
  sessionId,
  isActive,
  autoFocus = true,
  onSplit,
  onMaximize,
  onClose,
  onFocus,
}: {
  sessionId: string;
  isActive: boolean;
  autoFocus?: boolean;
  onSplit?: (dir: SplitDir) => void;
  onMaximize?: () => void;
  onClose?: () => void;
  onFocus?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const autoFocusRef = useRef(autoFocus);
  autoFocusRef.current = autoFocus;
  /* Holds a multi-line paste that is staged (shown but not yet executed)
     until the user confirms with Enter. Empty string = nothing staged. */
  const pasteBufferRef = useRef<string>('');
  /* Text the user types AFTER a paste is staged — lets them add to the pasted
     block before running it. Echoed live; flushed together with the buffer. */
  const pasteSuffixRef = useRef<string>('');
  /* De-dupes the two paste entry points (native `paste` event + our Ctrl+V key
     interception) so a single Ctrl+V never stages the clipboard twice. */
  const lastPasteRef = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  /* Set by the terminal effect; lets other handlers (e.g. the context-menu
     "Paste" action) route text through the same paste-staging pipeline. */
  const pasteTextRef = useRef<((text: string) => void) | null>(null);
  /* Set by the terminal effect; reads the clipboard then stages it. Used by
     the menu "Paste" action and the Ctrl+V key handler. */
  const clipboardPasteRef = useRef<(() => void) | null>(null);

  const session = useTerminalStore((s) => s.sessions.find((x) => x.id === sessionId));
  const markDead = useTerminalStore((s) => s.markDead);
  const markPtySpawned = useTerminalStore((s) => s.markPtySpawned);
  const ptySpawned = useTerminalStore((s) => s.ptySpawned);
  const renameSession = useTerminalStore((s) => s.renameSession);
  const theme = useSettingsStore((s) => s.settings.theme);
  const fontSize = useSettingsStore((s) => s.settings.fontSize);
  const fontFamily = useSettingsStore((s) => s.settings.fontFamily);
  const projectRoot = useProjectStore((s) => s.projectRoot);

  const [showMenu, setShowMenu] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);

  // Close options menu when clicking outside
  useEffect(() => {
    if (!showMenu) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.terminal-pane__menu-container')) {
        setShowMenu(false);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick, true);
    return () => {
      window.removeEventListener('mousedown', handleOutsideClick, true);
    };
  }, [showMenu]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !window.aios) return;

    const term = new XTerm({
      fontFamily: `'${fontFamily}', monospace`,
      fontSize: fontSize - 1,
      theme: getXtermTheme(theme),
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    fit.fit();

    // Selection cut on Backspace
    term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      if (e.type === 'keydown') {
        // Ctrl/Cmd+V and Shift+Insert → route through our paste-staging pipeline
        // instead of letting xterm emit a raw control char (SYN / \x16). This is
        // what makes keyboard paste actually work in line-oriented shells.
        const isPasteCombo =
          ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) ||
          (e.shiftKey && e.key === 'Insert');
        if (isPasteCombo) {
          clipboardPasteRef.current?.();
          e.preventDefault();
          return false;
        }
        if (e.key === 'Backspace' && term.hasSelection()) {
          const selection = term.getSelection();
          if (selection) {
            void navigator.clipboard.writeText(selection);
            if (window.aios) {
              window.aios.pty.write(sessionId, '\x7f'.repeat(selection.length));
            }
            term.clearSelection();
            e.preventDefault();
            return false;
          }
        }
      }
      return true;
    });

    xtermRef.current = term;
    fitRef.current = fit;

    /* ---- Multi-line paste staging -------------------------------------
       PowerShell (and any line-oriented shell without bracketed-paste
       support) executes a command on every carriage return. A raw
       multi-line paste therefore runs each line the instant it arrives.
       To give a "paste now, run on Enter" experience we stage multi-line
       pastes locally: the text is buffered, a condensed placeholder is
       drawn, and nothing is sent to the PTY until the user presses Enter. */

    // Draw / redraw the condensed placeholder for the currently staged paste.
    const drawPastePlaceholder = (isFirst: boolean) => {
      const lineCount = pasteBufferRef.current.split('\n').length;
      // On first stage, save the cursor position at the prompt (ESC 7).
      // On redraw, restore to it and clear anything we previously drew.
      term.write(isFirst ? '\x1b7' : '\x1b8\x1b[0J');
      const label = `[~${lineCount} line${lineCount === 1 ? '' : 's'} pasted \u2014 Enter to run \u00b7 Esc to cancel]`;
      term.write(`\x1b[2m${label}\x1b[0m`);
      // Echo anything the user has typed to append to the pasted block.
      if (pasteSuffixRef.current) term.write(` ${pasteSuffixRef.current}`);
    };

    // Remove the placeholder and restore the cursor to the prompt.
    const clearPastePlaceholder = () => {
      term.write('\x1b8\x1b[0J');
    };

    // Stage (or append to) a multi-line paste without executing it.
    const stagePaste = (normalized: string) => {
      const trimmed = normalized.replace(/\n+$/, '');
      const isFirst = pasteBufferRef.current.length === 0;
      pasteBufferRef.current = isFirst ? trimmed : `${pasteBufferRef.current}\n${trimmed}`;
      drawPastePlaceholder(isFirst);
    };

    // Send the staged paste to the shell (runs on the user's Enter).
    const flushPaste = () => {
      // Fold any text the user typed after pasting onto the final line.
      const combined = pasteSuffixRef.current
        ? `${pasteBufferRef.current}${pasteSuffixRef.current}`
        : pasteBufferRef.current;
      pasteBufferRef.current = '';
      pasteSuffixRef.current = '';
      clearPastePlaceholder();
      if (!combined) return;
      // Each line becomes its own command; the trailing \r triggers the run.
      window.aios!.pty.write(sessionId, `${combined.split('\n').join('\r')}\r`);
    };

    // Discard the staged paste without running anything.
    const cancelPaste = () => {
      if (!pasteBufferRef.current) return;
      pasteBufferRef.current = '';
      pasteSuffixRef.current = '';
      clearPastePlaceholder();
    };

    term.onData((data: string) => {
      if (pasteBufferRef.current) {
        // Enter → run the staged paste (plus any typed additions).
        if (data === '\r' || data === '\n') {
          flushPaste();
          return;
        }
        // Esc / Ctrl+C → discard the staged paste entirely.
        if (data === '\x1b' || data === '\x03') {
          cancelPaste();
          return;
        }
        // Backspace → edit the typed suffix; if there is nothing more to trim,
        // keep the paste staged rather than silently dropping it.
        if (data === '\x7f') {
          if (pasteSuffixRef.current) {
            pasteSuffixRef.current = pasteSuffixRef.current.slice(0, -1);
            drawPastePlaceholder(false);
          }
          return;
        }
        // Printable input → append to the staged block so the user can add to
        // the pasted content before pressing Enter.
        // eslint-disable-next-line no-control-regex
        if (!/[\x00-\x1f]/.test(data)) {
          pasteSuffixRef.current += data;
          drawPastePlaceholder(false);
          return;
        }
        // Any other control sequence cancels staging, then passes through.
        cancelPaste();
      }
      window.aios!.pty.write(sessionId, data);
    });

    const offData = window.aios.pty.onData((id, data) => {
      if (id !== sessionId) return;
      term.write(data);

      const urlMatch = data.match(/https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{4,5})/i);
      if (urlMatch) {
        const detectedUrl = urlMatch[0];
        const { activeDevServers, registerDevServer } = useProjectStore.getState();
        if (activeDevServers[sessionId] !== detectedUrl) {
          registerDevServer(sessionId, detectedUrl);
          toast.success('Server detected', `Connecting preview to ${detectedUrl}`);
        }
      }
    });
    const offExit = window.aios.pty.onExit((id, exitCode) => {
      if (id !== sessionId) return;
      term.write(`\r\n\x1b[90m[process exited with code ${exitCode}]\x1b[0m\r\n`);
      markDead(sessionId);
      const { unregisterDevServer } = useProjectStore.getState();
      unregisterDevServer(sessionId);
    });

    const alreadySpawned = ptySpawned.has(sessionId);

    const setupPty = async () => {
      if (alreadySpawned) {
        // Reattach to existing PTY - just ensure listeners are registered
        // The PTY process is still running, we just re-registered our listeners above
        if (autoFocusRef.current) term.focus();
        return;
      }

      // First time spawn
      if (!window.aios) return;
      window.aios.pty
        .spawn(sessionId, projectRoot || undefined, term.cols, term.rows)
        .then((res) => {
          if (!res.ok) {
            term.write(`\x1b[31mFailed to start terminal: ${res.error ?? 'unknown error'}\x1b[0m\r\n`);
            toast.error('Terminal unavailable', res.error ?? 'node-pty failed to load in this build.');
            return;
          }
          markPtySpawned(sessionId);
          const cmd = useTerminalStore.getState().sessions.find((s) => s.id === sessionId)?.initialCommand;
          if (cmd) {
            // Wait for shell to be ready before sending command
            setTimeout(() => window.aios!.pty.write(sessionId, `${cmd}\r`), 300);
          }
          if (autoFocusRef.current) term.focus();
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          term.write(`\x1b[31mFailed to start terminal: ${message}\x1b[0m\r\n`);
          toast.error('Terminal unavailable', message);
        });
    };

    setupPty();

    const resizeObserver = new ResizeObserver(() => {
      try {
        fit.fit();
        window.aios!.pty.resize(sessionId, term.cols, term.rows);
      } catch {
        /* container mid-teardown */
      }
    });
    resizeObserver.observe(container);

    /* Paste handling: intercept at capture so the browser's default insertion
       and xterm's own duplicate handler are both suppressed. Single-line text
       is pasted straight through; multi-line text is staged so it only runs
       when the user presses Enter (see staging helpers above). */
    const pasteText = (raw: string) => {
      if (!raw) return;
      const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      if (normalized.includes('\n')) {
        stagePaste(normalized);
      } else {
        term.paste(raw);
      }
    };
    pasteTextRef.current = pasteText;

    // Single funnel for every paste entry point. De-dupes the near-simultaneous
    // native `paste` event and Ctrl+V key interception that a single paste fires.
    const handleIncomingPaste = (raw: string) => {
      if (!raw) return;
      const now = Date.now();
      if (raw === lastPasteRef.current.text && now - lastPasteRef.current.at < 500) return;
      lastPasteRef.current = { text: raw, at: now };
      pasteText(raw);
    };

    // Read the clipboard, then stage/paste it. Used by Ctrl+V and menu Paste.
    const pasteFromClipboard = () => {
      navigator.clipboard
        .readText()
        .then((text) => handleIncomingPaste(text))
        .catch(() => toast.error('Paste failed', 'Clipboard access denied.'));
    };
    clipboardPasteRef.current = pasteFromClipboard;

    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      handleIncomingPaste(e.clipboardData?.getData('text') ?? '');
      return false;
    };
    container.addEventListener('paste', handlePaste, true);

    const handleWheel = (e: WheelEvent) => {
      const lines = Math.round(e.deltaY / 30) || (e.deltaY > 0 ? 1 : -1);
      term.scrollLines(lines);
      e.preventDefault();
      e.stopPropagation();
    };
    container.addEventListener('wheel', handleWheel, { passive: false });

    const handleClear = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.sessionId === sessionId) term.clear();
    };
    window.addEventListener('clear-terminal', handleClear);

    return () => {
      container.removeEventListener('wheel', handleWheel);
      window.removeEventListener('clear-terminal', handleClear);
      container.removeEventListener('paste', handlePaste, true);
      resizeObserver.disconnect();
      offData();
      offExit();
      pasteTextRef.current = null;
      clipboardPasteRef.current = null;
      /* Do NOT kill the PTY here — we want the shell to stay alive
         when the pane is hidden (e.g., tab switch). The PTY is only
         killed when the user explicitly closes the session. */
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    if (xtermRef.current) xtermRef.current.options.theme = getXtermTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.fontSize = fontSize - 1;
      xtermRef.current.options.fontFamily = `'${fontFamily}', monospace`;
      try {
        fitRef.current?.fit();
      } catch {}
    }
  }, [fontSize, fontFamily]);

  useEffect(() => {
    if (!isActive) return;
    const term = xtermRef.current;
    const fit = fitRef.current;
    if (!term) return;
    const id = requestAnimationFrame(() => {
      try {
        fit?.fit();
        if (window.aios) window.aios.pty.resize(sessionId, term.cols, term.rows);
      } catch {}
      if (autoFocus) term.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [isActive, autoFocus, sessionId]);

  const focusTerminal = () => {
    onFocus?.();
    xtermRef.current?.focus();
  };

  // Keyboard shortcuts for the terminal pane
  useHotkey('ctrl+a', (e) => {
    e.preventDefault();
    handleSelectAll();
  }, { allowInInputs: true, enabled: isActive });

  useHotkey('ctrl+shift+c', (e) => {
    e.preventDefault();
    handleCopy();
  }, { allowInInputs: true, enabled: isActive });

  useHotkey('ctrl+shift+x', (e) => {
    e.preventDefault();
    handleCut();
  }, { allowInInputs: true, enabled: isActive });

  useHotkey('ctrl+shift+v', (e) => {
    e.preventDefault();
    handlePaste();
  }, { allowInInputs: true, enabled: isActive });

  useHotkey('ctrl+shift+k', (e) => {
    e.preventDefault();
    handleClear();
  }, { allowInInputs: true, enabled: isActive });

  useHotkey('ctrl+shift+enter', (e) => {
    e.preventDefault();
    toggleMaximize();
  }, { allowInInputs: true, enabled: isActive });

  useHotkey('ctrl+shift+r', (e) => {
    e.preventDefault();
    setShowMenu(false);
    setIsRenaming(true);
  }, { allowInInputs: true, enabled: isActive });

  useHotkey('ctrl+shift+arrowright', (e) => {
    e.preventDefault();
    onSplit?.('row');
  }, { allowInInputs: true, enabled: isActive });

  useHotkey('ctrl+shift+arrowdown', (e) => {
    e.preventDefault();
    onSplit?.('col');
  }, { allowInInputs: true, enabled: isActive });

  useHotkey('ctrl+shift+q', (e) => {
    e.preventDefault();
    if (onClose) onClose();
  }, { allowInInputs: true, enabled: isActive });

  const handleCopy = () => {
    setShowMenu(false);
    const term = xtermRef.current;
    if (!term) return;
    const text = term.getSelection();
    if (text) {
      void navigator.clipboard.writeText(text);
      toast.success('Copied text', 'Selection copied to clipboard.');
    } else {
      toast.info('No selection', 'Select text in terminal to copy.');
    }
  };

  const handlePaste = async () => {
    setShowMenu(false);
    if (!window.aios) return;
    xtermRef.current?.focus();
    // Route through the same staging pipeline as Ctrl+V so multi-line pastes
    // are condensed and staged rather than executed line-by-line.
    if (clipboardPasteRef.current) {
      clipboardPasteRef.current();
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      if (pasteTextRef.current) {
        pasteTextRef.current(text);
      } else {
        window.aios.pty.write(sessionId, text);
      }
    } catch {
      toast.error('Paste failed', 'Clipboard access denied.');
    }
  };

  const handleClear = () => {
    setShowMenu(false);
    window.dispatchEvent(new CustomEvent('clear-terminal', { detail: { sessionId } }));
  };

  const handleSelectAll = () => {
    setShowMenu(false);
    const term = xtermRef.current;
    if (term) {
      term.selectAll();
    }
  };

  const handleCut = () => {
    setShowMenu(false);
    const term = xtermRef.current;
    if (!term) return;
    const text = term.getSelection();
    if (text) {
      term.selectAll();
      term.clearSelection();
      void navigator.clipboard.writeText(text);
      toast.success('Cut text', 'Selection copied to clipboard.');
    } else {
      toast.info('No selection', 'Select text to cut.');
    }
  };

  const toggleMaximize = () => {
    setShowMenu(false);
    setIsMaximized((prev) => !prev);
    onMaximize?.();
  };

  return (
    <div
      className={`terminal-pane ${isMaximized ? 'terminal-pane--maximized' : ''}`}
      data-session-id={sessionId}
    >
      <div className="terminal-pane__header">
        <span className="terminal-pane__title">
          <span
            className={`terminal-pane__dot ${session?.isDead ? 'terminal-pane__dot--dead' : ''}`}
          />
          {isRenaming ? (
            <input
              type="text"
              className="terminal-pane__rename-input"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: 'inherit',
                fontSize: '11px',
                padding: '2px 6px',
                borderRadius: '3px',
                outline: 'none',
                width: '100px'
              }}
              defaultValue={session?.name || 'Terminal'}
              autoFocus
              onBlur={(e) => {
                const val = e.target.value.trim();
                if (val) renameSession(sessionId, val);
                setIsRenaming(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const val = (e.target as HTMLInputElement).value.trim();
                  if (val) renameSession(sessionId, val);
                  setIsRenaming(false);
                } else if (e.key === 'Escape') {
                  setIsRenaming(false);
                }
              }}
            />
          ) : (
            <span onDoubleClick={() => setIsRenaming(true)} style={{ cursor: 'pointer' }} title="Double click to rename">
              {session?.name ?? 'Terminal'}
            </span>
          )}
        </span>

        <div className="terminal-pane__menu-container">
          <button
            type="button"
            className="terminal-pane__menu-btn"
            onClick={() => setShowMenu((prev) => !prev)}
            title="Terminal options"
            aria-label="Terminal options"
          >
            <MoreVertical size={14} />
          </button>

          {showMenu && (
            <div className="terminal-pane__dropdown glass" role="menu">
              <button
                type="button"
                onClick={() => {
                  setShowMenu(false);
                  setIsRenaming(true);
                }}
              >
                <span className="terminal-pane__menu-item-left">
                  <TerminalSquare size={13} /> Rename...
                </span>
                <kbd className="terminal-pane__menu-shortcut">Ctrl+Shift+R</kbd>
              </button>
              <button type="button" onClick={() => { setShowMenu(false); onSplit?.('row'); }}>
                <span className="terminal-pane__menu-item-left">
                  <Columns size={13} /> Split right
                </span>
                <kbd className="terminal-pane__menu-shortcut">Ctrl+Shift+→</kbd>
              </button>
              <button type="button" onClick={() => { setShowMenu(false); onSplit?.('col'); }}>
                <span className="terminal-pane__menu-item-left">
                  <Rows size={13} /> Split down
                </span>
                <kbd className="terminal-pane__menu-shortcut">Ctrl+Shift+↓</kbd>
              </button>
              <div className="terminal-pane__divider" />
              <button type="button" onClick={handleSelectAll}>
                <span className="terminal-pane__menu-item-left">
                  <Square size={13} /> Select All
                </span>
                <kbd className="terminal-pane__menu-shortcut">Ctrl+A</kbd>
              </button>
              <button type="button" onClick={handleCopy}>
                <span className="terminal-pane__menu-item-left">
                  <Copy size={13} /> Copy
                </span>
                <kbd className="terminal-pane__menu-shortcut">Ctrl+Shift+C</kbd>
              </button>
              <button type="button" onClick={handleCut}>
                <span className="terminal-pane__menu-item-left">
                  <Scissors size={13} /> Cut
                </span>
                <kbd className="terminal-pane__menu-shortcut">Ctrl+Shift+X</kbd>
              </button>
              <button type="button" onClick={handlePaste}>
                <span className="terminal-pane__menu-item-left">
                  <Clipboard size={13} /> Paste
                </span>
                <kbd className="terminal-pane__menu-shortcut">Ctrl+Shift+V</kbd>
              </button>
              <button type="button" onClick={handleClear}>
                <span className="terminal-pane__menu-item-left">
                  <Eraser size={13} /> Clear
                </span>
                <kbd className="terminal-pane__menu-shortcut">Ctrl+Shift+K</kbd>
              </button>
              <button type="button" onClick={toggleMaximize}>
                <span className="terminal-pane__menu-item-left">
                  {isMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                  {isMaximized ? 'Restore' : 'Maximize'}
                </span>
                <kbd className="terminal-pane__menu-shortcut">Ctrl+Shift+Enter</kbd>
              </button>
              {onClose && (
                <button type="button" className="terminal-pane__close" onClick={() => { setShowMenu(false); onClose(); }}>
                  <span className="terminal-pane__menu-item-left">
                    <X size={13} /> Close
                  </span>
                  <kbd className="terminal-pane__menu-shortcut">Ctrl+Shift+Q</kbd>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div
        className="terminal__xterm"
        ref={containerRef}
        onMouseDown={focusTerminal}
        onClick={focusTerminal}
      />
    </div>
  );
}

function NoElectronNotice() {
  return (
    <div className="terminal__empty">
      <TerminalSquare size={38} className="terminal__empty-icon" />
      <p className="terminal__empty-title">Real terminals require the AIOS desktop app</p>
      <p className="terminal__empty-sub">
        Running in a browser tab has no OS shell access. Launch the Electron build to get a
        real, interactive terminal session.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Terminal View                                                     */
/* ------------------------------------------------------------------ */

export function TerminalView() {
  const sessions = useTerminalStore((s) => s.sessions);
  const activeSessionId = useTerminalStore((s) => s.activeSessionId);
  const addSession = useTerminalStore((s) => s.addSession);
  const removeSession = useTerminalStore((s) => s.removeSession);
  const setActiveSession = useTerminalStore((s) => s.setActiveSession);
  const lastWorkspaceDeploy = useTerminalStore((s) => s.lastWorkspaceDeploy);
  const clearLastWorkspaceDeploy = useTerminalStore((s) => s.clearLastWorkspaceDeploy);

  const [layouts, setLayouts] = useState<Record<string, PaneNode>>({});
  const [maximizedSessionId, setMaximizedSessionId] = useState<string | null>(null);
  const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null);

  const isElectron = typeof window !== 'undefined' && Boolean(window.aios);

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;

  /* Which session owns keyboard focus within the active tab. */
  const activeLayout = activeSessionId
    ? layouts[activeSessionId] ?? ({ kind: 'leaf', sessionId: activeSessionId } as PaneNode)
    : null;
  const activeLeaves = activeLayout ? collectLeaves(activeLayout) : [];
  const effectiveFocusedId =
    focusedSessionId && activeLeaves.includes(focusedSessionId)
      ? focusedSessionId
      : activeSessionId;

  // Get all session IDs that are nested inside any split layout
  const nestedSessionIds = new Set<string>();
  Object.entries(layouts).forEach(([tabId, node]) => {
    const leaves = collectLeaves(node);
    leaves.forEach((id) => {
      // If the leaf ID is not the tabId itself, it is nested and should be hidden from the tab bar
      if (id !== tabId) {
        nestedSessionIds.add(id);
      }
    });
  });

  const visibleSessions = sessions.filter((s) => !nestedSessionIds.has(s.id));

  const splitPane = useCallback(
    (tabId: string, sessionId: string, dir: SplitDir) => {
      const newId = addSession({ activate: false });
      setLayouts((prev) => {
        const layout = prev[tabId] ?? ({ kind: 'leaf', sessionId: tabId } as PaneNode);
        const next = mapLeaf(layout, sessionId, (leaf) => ({
          kind: 'split',
          dir,
          ratio: 0.5,
          a: leaf,
          b: { kind: 'leaf', sessionId: newId },
        }));
        return { ...prev, [tabId]: next };
      });
      setActiveSession(tabId);
      toast.success('Terminal split', `Split ${dir === 'row' ? 'side-by-side' : 'top-and-bottom'}.`);
    },
    [addSession, setActiveSession],
  );

  /** Auto-split a list of session IDs into a balanced grid within the active tab. */
  const autoSplitGrid = useCallback(
    (ids: string[]) => {
      if (ids.length <= 1) return;
      const tabId = activeSessionId;
      if (!tabId) return;

      const gridLayout = buildBalancedGrid(ids);
      
      setLayouts((prev) => ({ ...prev, [tabId]: gridLayout }));
      setActiveSession(tabId);
      toast.success('Grid layout applied', `Arranged ${ids.length} terminals in a grid.`);
    },
    [activeSessionId, setActiveSession],
  );

  const closePane = useCallback(
    (tabId: string, sessionId: string) => {
      if (window.aios) window.aios.pty.kill(sessionId);
      removeSession(sessionId);
      setLayouts((prev) => {
        const layout = prev[tabId];
        if (!layout) return prev;
        const { tree, removed } = removeLeaf(layout, sessionId);
        const next = { ...prev };
        if (!tree || (removed && tree.kind === 'leaf' && (tree as any).sessionId === sessionId)) {
          delete next[tabId];
        } else if (tree) {
          next[tabId] = tree;
        }
        return next;
      });
      setFocusedSessionId((prev) => (prev === sessionId ? null : prev));
    },
    [removeSession],
  );

  const closeTab = useCallback(
    (tabId: string) => {
      const layout = layouts[tabId];
      const idsToKill = layout ? collectLeaves(layout) : [tabId];
      idsToKill.forEach((id) => {
        if (window.aios) window.aios.pty.kill(id);
        removeSession(id);
      });
      setLayouts((prev) => {
        const next = { ...prev };
        delete next[tabId];
        return next;
      });
      setFocusedSessionId((prev) => (prev && idsToKill.includes(prev) ? null : prev));
    },
    [layouts, removeSession],
  );

  const updateRatio = useCallback((tabId: string, path: ('a' | 'b')[], ratio: number) => {
    setLayouts((prev) => {
      const layout = prev[tabId];
      if (!layout) return prev;
      return { ...prev, [tabId]: setRatioAt(layout, path, ratio) };
    });
  }, []);

  const handleTarget = effectiveFocusedId ?? activeSessionId;

  /** Remove a session from wherever it lives (root tab or nested split). */
  const closeSession = useCallback(
    (sessionId: string) => {
      let owningTab: string | undefined;
      for (const [tabId, node] of Object.entries(layouts)) {
        if (containsSession(node, sessionId)) {
          owningTab = tabId;
          break;
        }
      }
      if (!owningTab) owningTab = sessionId;
      closePane(owningTab, sessionId);
    },
    [layouts, closePane],
  );

  // Auto-split grid when workspaces are deployed with grid layout

  useEffect(() => {
    if (lastWorkspaceDeploy?.layout === 'grid' && lastWorkspaceDeploy.ids.length > 1) {
      autoSplitGrid(lastWorkspaceDeploy.ids);
      clearLastWorkspaceDeploy();
    }
  }, [lastWorkspaceDeploy, autoSplitGrid, clearLastWorkspaceDeploy]);

  const handleKill = useCallback(() => {
    if (handleTarget) closeSession(handleTarget);
  }, [handleTarget, closeSession]);

  const startDividerDrag = useCallback(
    (e: React.MouseEvent, tabId: string, path: ('a' | 'b')[], dir: SplitDir) => {
      e.preventDefault();
      const container = (e.currentTarget as HTMLElement).parentElement;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const onMove = (ev: MouseEvent) => {
        const r =
          dir === 'row'
            ? (ev.clientX - rect.left) / rect.width
            : (ev.clientY - rect.top) / rect.height;
        updateRatio(tabId, path, Math.max(0.1, Math.min(0.9, r)));
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [updateRatio],
  );

  const renderNode = (
    node: PaneNode,
    tabId: string,
    path: ('a' | 'b')[],
    isRootActive: boolean,
  ): React.ReactNode => {
    if (isLeaf(node)) {
      const isFocusedLeaf = node.sessionId === effectiveFocusedId;
      const isMaximized = maximizedSessionId === node.sessionId;
      if (isMaximized) {
        return (
          <TerminalPane
            key={node.sessionId}
            sessionId={node.sessionId}
            isActive={isRootActive}
            autoFocus
            onFocus={() => setFocusedSessionId(node.sessionId)}
            onMaximize={() => setMaximizedSessionId(null)}
            onClose={() => closePane(tabId, node.sessionId)}
          />
        );
      }
      return (
        <TerminalPane
          key={node.sessionId}
          sessionId={node.sessionId}
          isActive={isRootActive && (isFocusedLeaf || effectiveFocusedId === activeSessionId)}
          autoFocus={isFocusedLeaf || (effectiveFocusedId === activeSessionId && path.length === 0)}
          onSplit={(dir) => splitPane(tabId, node.sessionId, dir)}
          onMaximize={() => setMaximizedSessionId(node.sessionId)}
          onClose={() => closePane(tabId, node.sessionId)}
          onFocus={() => setFocusedSessionId(node.sessionId)}
        />
      );
    }

    const flexDir = node.dir === 'row' ? 'row' : 'column';
    return (
      <div
        key={path.join('/') || 'root'}
        className={`terminal-split terminal-split--${node.dir}`}
        style={{ flexDirection: flexDir }}
      >
        <div className="terminal-split__pane" style={node.dir === 'row' ? { width: `${node.ratio * 100}%` } : { height: `${node.ratio * 100}%` }}>
          {renderNode(node.a, tabId, [...path, 'a'], isRootActive)}
        </div>
        <div
          className={`terminal-resize-divider terminal-resize-divider--${node.dir}`}
          onMouseDown={(e) => startDividerDrag(e, tabId, path, node.dir)}
          role="separator"
          aria-orientation={node.dir === 'row' ? 'vertical' : 'horizontal'}
        />
        <div className="terminal-split__pane" style={node.dir === 'row' ? { width: `${(1 - node.ratio) * 100}%` } : { height: `${(1 - node.ratio) * 100}%` }}>
          {renderNode(node.b, tabId, [...path, 'b'], isRootActive)}
        </div>
      </div>
    );
  };

  return (
    <div
      className={`terminal ${activeLeaves.length > 1 ? 'terminal--workspace-deployed' : ''}`}
    >
      <header className="terminal__toolbar">
        <div className="terminal__brand">
          <TerminalSquare size={16} className="terminal__brand-icon" />
          <span className="terminal__brand-label">Terminal</span>
          <span className="terminal__count">
            {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
          </span>
        </div>
        <div className="terminal__toolbar-actions">
          <IconButton
            icon={<Eraser size={15} />}
            tooltip="Clear scrollback"
            variant="ghost"
            size="sm"
            disabled={!effectiveFocusedId}
            onClick={() => {
              if (effectiveFocusedId) {
                window.dispatchEvent(
                  new CustomEvent('clear-terminal', { detail: { sessionId: effectiveFocusedId } }),
                );
                toast.success('Terminal cleared', 'Scrollback buffer cleared.');
              }
            }}
          />
          <IconButton
            icon={<Columns size={15} />}
            tooltip="Split focused right"
            variant="ghost"
            size="sm"
            disabled={!handleTarget}
            onClick={() => handleTarget && splitPane(activeSessionId!, handleTarget, 'row')}
          />
          <IconButton
            icon={<Rows size={15} />}
            tooltip="Split focused down"
            variant="ghost"
            size="sm"
            disabled={!handleTarget}
            onClick={() => handleTarget && splitPane(activeSessionId!, handleTarget, 'col')}
          />
          <IconButton
            icon={<Skull size={15} />}
            tooltip="Kill focused session"
            variant="ghost"
            size="sm"
            className="terminal__kill-btn"
            disabled={!handleTarget}
            onClick={handleKill}
          />
        </div>
      </header>

      <div className="terminal__tabs" role="tablist">
        {visibleSessions.map((session) => (
          <div
            key={session.id}
            role="tab"
            tabIndex={0}
            aria-selected={session.id === activeSessionId}
            className={`terminal__tab ${session.id === activeSessionId ? 'terminal__tab--active' : ''}`}
            onClick={() => setActiveSession(session.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setActiveSession(session.id);
              }
            }}
          >
            <span className={`terminal__tab-dot ${session.isDead ? 'terminal__tab-dot--dead' : ''}`} />
            <span className="terminal__tab-name">{session.name}</span>
            <button
              type="button"
              className="terminal__tab-close"
              aria-label={`Close ${session.name}`}
              onClick={(e) => {
                e.stopPropagation();
                closeTab(session.id);
              }}
            >
              <X size={12} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="terminal__tab-add"
          aria-label="New terminal session"
          onClick={() => addSession()}
        >
          <Plus size={14} />
        </button>
      </div>

      {!isElectron ? (
        <NoElectronNotice />
      ) : activeSession ? (
        <div className="terminal__body">
          {sessions.map((session) => {
            const layout = layouts[session.id] ?? ({ kind: 'leaf', sessionId: session.id } as PaneNode);
            const isTabActive = session.id === activeSessionId;
            const isMaximized = maximizedSessionId === session.id;
            
            if (isMaximized) {
              return (
                <div
                  key={session.id}
                  className="terminal__layout"
                  style={{ display: isTabActive ? 'flex' : 'none', flex: 1 }}
                >
                  {renderNode(
                    { kind: 'leaf', sessionId: maximizedSessionId },
                    session.id,
                    [],
                    isTabActive,
                  )}
                </div>
              );
            }
            
            return (
              <div
                key={session.id}
                className="terminal__layout"
                style={{ display: isTabActive ? 'flex' : 'none', flex: 1 }}
              >
                {renderNode(layout, session.id, [], isTabActive)}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="terminal__empty">
          <TerminalSquare size={38} className="terminal__empty-icon" />
          <p className="terminal__empty-title">No active session</p>
          <p className="terminal__empty-sub">Open a new terminal to start running commands.</p>
          <button type="button" className="terminal__empty-btn" onClick={() => addSession()}>
            <Plus size={15} /> New Terminal
          </button>
        </div>
      )}
    </div>
  );
}
