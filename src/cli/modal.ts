/* ================================================
   AIOS CLI — modal popup primitive
   A browser/app-style floating popup with a bordered
   box, title bar, scrollable body and a scrollbar on
   the right edge. Supports a stack of pages:

     list  → a navigable, optionally searchable list
     input → a single-line (masked) text entry field

   The caller drives navigation through a controller:
   choosing a list item or submitting input returns the
   next page to push, or null to close with that value.
   ================================================ */

import { ansi } from './ui';

export interface ModalItem {
  id: string;
  label: string;
  description?: string;
  selected?: boolean;
  /** Marks a non-selectable row (e.g. a section header). */
  header?: boolean;
  /** Dim the row (e.g. a hint line). */
  dim?: boolean;
}

export type ModalPage =
  | { kind: 'list'; title: string; items: ModalItem[]; searchable?: boolean; selectedId?: string }
  | { kind: 'input'; title: string; secret?: boolean; placeholder?: string };

export interface ModalOutcome {
  type: 'item' | 'input' | 'cancel';
  item?: ModalItem;
  value?: string;
}

export interface ModalController {
  onSelect?: (
    item: ModalItem,
    page: Extract<ModalPage, { kind: 'list' }>,
  ) => ModalPage | null | void | Promise<ModalPage | null | void>;
  onInput?: (
    value: string,
    page: Extract<ModalPage, { kind: 'input' }>,
  ) => ModalPage | null | void | Promise<ModalPage | null | void>;
}

const FILTER = (items: ModalItem[], q: string): ModalItem[] => {
  const t = q.trim().toLowerCase();
  if (!t) return items;
  return items.filter((i) => i.label.toLowerCase().includes(t) || (i.description ?? '').toLowerCase().includes(t));
};

export class Modal {
  private stack: ModalPage[] = [];
  private index = 0;
  private scrollTop = 0;
  private search = '';
  private inputValue = '';
  private prevRows = 0;
  private resolveFn: ((o: ModalOutcome) => void) | null = null;
  private busy = false;

  constructor(
    private out: NodeJS.WriteStream,
    private controller: ModalController,
    private onClose?: () => void,
  ) {}

  open(root: ModalPage): Promise<ModalOutcome> {
    return new Promise((resolve) => {
      this.resolveFn = resolve;
      this.stack = [root];
      this.enterPage(root);
      // Enter Alternate Screen Buffer, hide cursor, home cursor
      this.out.write('\x1b[?1049h\x1b[H\x1b[?25l');
      this.render();
    });
  }

  private get page(): ModalPage {
    return this.stack[this.stack.length - 1];
  }

  private visibleItems(): ModalItem[] {
    const p = this.page;
    if (p.kind !== 'list') return [];
    return p.searchable ? FILTER(p.items, this.search) : p.items;
  }

  private enterPage(p: ModalPage): void {
    this.index = 0;
    this.scrollTop = 0;
    if (p.kind === 'list') {
      this.search = '';
      const sel = p.items.findIndex((i) => i.selected);
      this.index = sel >= 0 ? sel : 0;
    } else {
      this.inputValue = '';
    }
  }

  /** Box geometry based on the current terminal size. */
  private box(): { w: number; h: number; left: number } {
    const cols = (this.out as any).columns || 100;
    const rows = (this.out as any).rows || 40;
    const w = Math.max(60, Math.min(cols - 10, 86));
    const h = Math.max(14, Math.min(rows - 6, 24));
    const left = Math.max(0, Math.floor((cols - w) / 2));
    return { w, h, left };
  }

  private layout(p: ModalPage) {
    const { h } = this.box();
    const search = p.kind === 'list' && p.searchable;
    const title = 1;
    const searchH = search ? 1 : 0;
    const hints = 1;
    const bodyH = h - 1 /*top border*/ - title - searchH - hints - 1 /*bottom border*/;
    return { bodyH: Math.max(1, bodyH), searchH, title };
  }

  handleKey(_ch: string | undefined, key: any): void {
    if (this.busy) return;
    const p = this.page;
    const name = key?.name;
    const ctrl = !!key?.ctrl;
    const items = this.visibleItems();

    // Global: Esc goes back one page or cancels if at the root.
    if (name === 'escape') {
      this.back();
      return;
    }

    // Ctrl+C / Ctrl+D → quit the REPL.
    if (ctrl && (name === 'c' || name === 'd')) {
      this.finish({ type: 'cancel' });
      return;
    }

    if (p.kind === 'input') {
      if (name === 'return' || name === 'enter' || _ch === '\r' || _ch === '\n') {
        void this.submitInput();
        return;
      }
      if (name === 'backspace' || name === 'delete' || _ch === '\x7f' || _ch === '\b') {
        this.inputValue = this.inputValue.slice(0, -1);
        this.render();
        return;
      }
      if (_ch && _ch >= ' ' && !ctrl && !key?.meta) {
        this.inputValue += _ch;
        this.render();
        return;
      }
      return;
    }

    // List page.
    if (p.searchable && (name === 'backspace' || name === 'delete' || _ch === '\x7f' || _ch === '\b')) {
      this.search = this.search.slice(0, -1);
      this.index = 0;
      this.scrollTop = 0;
      this.render();
      return;
    }
    if (p.searchable && _ch && _ch >= ' ' && _ch !== '\x7f' && _ch !== '\b' && !ctrl && !key?.meta && name !== 'return') {
      this.search += _ch;
      this.index = 0;
      this.scrollTop = 0;
      this.render();
      return;
    }

    if (name === 'up' || _ch === '\x1b[A') {
      this.move(-1, items.length);
      this.render();
    } else if (name === 'down' || _ch === '\x1b[B') {
      this.move(1, items.length);
      this.render();
    } else if (name === 'return' || name === 'enter' || _ch === '\r' || _ch === '\n' || name === 'tab') {
      if (items[this.index]) void this.selectItem(items[this.index]);
    }
  }

  handleScroll(dir: number): void {
    if (this.busy) return;
    if (this.page.kind !== 'list') return;
    const items = this.visibleItems();
    this.move(dir, items.length);
    this.render();
  }

  private move(dir: number, n: number): void {
    if (n === 0) return;
    this.index = (this.index + dir + n) % n;
  }

  private back(): void {
    if (this.stack.length > 1) {
      this.stack.pop();
      this.enterPage(this.page);
      this.render();
    } else {
      this.finish({ type: 'cancel' });
    }
  }

  private async selectItem(item: ModalItem): Promise<void> {
    const p = this.page as Extract<ModalPage, { kind: 'list' }>;
    const next = (await this.controller.onSelect?.(item, p)) ?? null;
    if (next) {
      this.stack.push(next);
      this.enterPage(next);
      this.render();
    } else {
      this.finish({ type: 'item', item });
    }
  }

  private async submitInput(): Promise<void> {
    const p = this.page as Extract<ModalPage, { kind: 'input' }>;
    const next = (await this.controller.onInput?.(this.inputValue, p)) ?? null;
    if (next) {
      this.stack.push(next);
      this.enterPage(next);
      this.render();
    } else {
      this.finish({ type: 'input', value: this.inputValue });
    }
  }

  private finish(o: ModalOutcome): void {
    const r = this.resolveFn;
    this.resolveFn = null;
    // Exit Alternate Screen Buffer, restore cursor
    this.out.write('\x1b[?1049l\x1b[?25h');
    this.onClose?.();
    r?.(o);
  }

  /* ---- Rendering ------------------------------------------------ */

  private erase(): void {
    // No-op: handled by full-screen redraws on alternate buffer
  }

  render(): void {
    // Clear screen on Alternate Buffer
    this.out.write('\x1b[H\x1b[0J');

    const { w, h, left } = this.box();
    const cols = (this.out as any).columns || 100;
    const rows = (this.out as any).rows || 40;

    // Vertical centering padding
    const topPad = Math.max(0, Math.floor((rows - h) / 2));
    this.out.write('\n'.repeat(topPad));

    const pad = ' '.repeat(left);
    const inner = w - 2; // between borders
    const p = this.page;
    const { bodyH, searchH } = this.layout(p);
    const items = this.visibleItems();

    // Keep selection in view.
    if (this.index < this.scrollTop) this.scrollTop = this.index;
    if (this.index >= this.scrollTop + bodyH) this.scrollTop = this.index - bodyH + 1;
    if (this.scrollTop < 0) this.scrollTop = 0;
    if (this.scrollTop > Math.max(0, items.length - bodyH)) this.scrollTop = Math.max(0, items.length - bodyH);

    const lines: string[] = [];
    const bar = (s: string) => pad + '│' + s + '│';

    // Top border.
    lines.push(pad + '┌' + '─'.repeat(inner) + '┐');
    // Title.
    lines.push(bar(' ' + ansi.bold(ansi.cyan('◈ ' + p.title)) + ' '.repeat(Math.max(0, inner - 2 - ('◈ ' + p.title).length))));
    
    // Search bar.
    if (searchH) {
      const q = this.search.length ? this.search : (p.kind === 'list' ? 'type to filter…' : '');
      const caret = this.search.length ? '█' : '';
      const s = '🔍 ' + q + caret + ' '.repeat(Math.max(0, inner - 3 - ('🔍 ' + q + caret).length));
      lines.push(bar(ansi.gray(s)));
    }

    // Body (list or input field).
    if (p.kind === 'input') {
      const inputY = Math.floor(bodyH / 2);
      for (let r = 0; r < bodyH; r++) {
        if (r === inputY) {
          const displayVal = p.secret ? '•'.repeat(this.inputValue.length) : this.inputValue;
          const caret = '█';
          const text = '  ' + displayVal + caret;
          const padLen = Math.max(0, inner - 3 - text.length);
          lines.push(bar(ansi.cyan(text) + ' '.repeat(padLen) + ansi.gray(' ')));
        } else if (r === inputY - 1) {
          const promptMsg = p.placeholder ?? 'Enter value:';
          const text = '  ' + promptMsg;
          const padLen = Math.max(0, inner - 3 - text.length);
          lines.push(bar(ansi.gray(text) + ' '.repeat(padLen) + ansi.gray(' ')));
        } else {
          lines.push(bar(' '.repeat(inner - 1)));
        }
      }
    } else {
      const thumb = this.scrollbar(items.length, bodyH);
      for (let r = 0; r < bodyH; r++) {
        const itemIdx = this.scrollTop + r;
        let content: string;
        let scrollChar = ' ';
        if (r < thumb.length) scrollChar = thumb[r];
        if (itemIdx < items.length) {
          const it = items[itemIdx];
          const sel = itemIdx === this.index;
          const mark = sel ? ansi.cyan('❯ ') : '  ';
          let text = mark + ansi.bold(it.label);
          if (it.description) text += '  ' + ansi.gray(it.description);
          content = text + ' '.repeat(Math.max(0, inner - 3 - text.length));
        } else {
          content = ' '.repeat(inner - 1);
        }
        lines.push(bar(content.slice(0, inner - 2) + ' ' + ansi.gray(scrollChar)));
      }
    }

    // Hints footer.
    const hint = p.kind === 'input' ? '⏎ submit · Esc back' : '↑↓ move · ⏎ select · Esc back';
    lines.push(bar(ansi.dim(hint + ' '.repeat(Math.max(0, inner - 2 - hint.length)))));
    
    // Bottom border.
    lines.push(pad + '└' + '─'.repeat(inner) + '┘');

    this.out.write(lines.join('\n') + '\n');
    this.prevRows = lines.length;
  }

  /** Build the scrollbar column (length = bodyH) for `n` items. */
  private scrollbar(n: number, bodyH: number): string[] {
    const col: string[] = new Array(bodyH).fill(' ');
    if (n <= bodyH || n === 0) {
      for (let i = 0; i < bodyH; i++) col[i] = '│';
      return col;
    }
    const thumbH = Math.max(1, Math.round((bodyH * bodyH) / n));
    const maxTop = Math.max(0, n - bodyH);
    const top = Math.round((this.scrollTop / maxTop) * (bodyH - thumbH));
    for (let i = 0; i < thumbH; i++) {
      const pos = Math.min(bodyH - 1, top + i);
      col[pos] = '█';
    }
    return col;
  }
}