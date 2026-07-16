import { useEffect } from 'react';

type HotkeyHandler = (e: KeyboardEvent) => void;

interface HotkeyOptions {
  /** Fire even when focus is inside an input/textarea/contentEditable. */
  allowInInputs?: boolean;
  enabled?: boolean;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || target.isContentEditable;
}

/**
 * Registers a global keyboard shortcut.
 * `combo` examples: "mod+k", "mod+shift+p", "escape", "mod+b".
 * "mod" maps to Cmd on macOS and Ctrl elsewhere.
 */
export function useHotkey(combo: string, handler: HotkeyHandler, options: HotkeyOptions = {}) {
  const { allowInInputs = false, enabled = true } = options;

  useEffect(() => {
    if (!enabled) return;

    const parts = combo.toLowerCase().split('+').map((p) => p.trim());
    const key = parts[parts.length - 1];
    // Modifier handling: 'mod' means Cmd (mac) or Ctrl (elsewhere). 'ctrl',
    // 'cmd'/'meta', 'shift' and 'alt' are also honoured explicitly so combos
    // like "ctrl+a" only fire when Ctrl is actually held.
    const needMod = parts.includes('mod');
    const needCtrl = needMod || parts.includes('ctrl') || parts.includes('control');
    const needMeta = needMod || parts.includes('cmd') || parts.includes('meta') || parts.includes('command');
    const needShift = parts.includes('shift');
    const needAlt = parts.includes('alt') || parts.includes('option');

    const onKeyDown = (e: KeyboardEvent) => {
      if (!allowInInputs && isEditableTarget(e.target)) return;
      if (needCtrl && !e.ctrlKey) return;
      if (needMeta && !e.metaKey) return;
      if (needShift !== e.shiftKey) return;
      if (needAlt !== e.altKey) return;
      if (e.key.toLowerCase() !== key) return;
      handler(e);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [combo, handler, allowInInputs, enabled]);
}
