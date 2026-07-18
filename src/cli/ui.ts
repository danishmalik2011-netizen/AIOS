/* ================================================
   AIOS CLI — presentation layer
   A tiny zero-dependency ANSI helper, a terminal markdown
   renderer (mirrors the app's custom chat renderer), the
   streaming turn UI, and an interactive REPL input with
   composer-style hotkeys + slash-command autocomplete.
   ================================================ */

import readline from 'node:readline';

/* ---- ANSI ---------------------------------------------------------- */

const ESC = '\x1b[';

const supportsColor = () =>
  process.stdout.isTTY && process.env.NO_COLOR == null && process.env.TERM !== 'dumb';

const C = supportsColor()
  ? {
      reset: `${ESC}0m`,
      bold: `${ESC}1m`,
      dim: `${ESC}2m`,
      italic: `${ESC}3m`,
      underline: `${ESC}4m`,
      red: `${ESC}31m`,
      green: `${ESC}32m`,
      yellow: `${ESC}33m`,
      blue: `${ESC}34m`,
      magenta: `${ESC}35m`,
      cyan: `${ESC}36m`,
      gray: `${ESC}90m`,
      bgCyan: `${ESC}46m`,
      bgBlue: `${ESC}44m`,
      // Curated 256-colour accents — distinct, harmonious, never clashing.
      // FIX: ESC is already '\x1b[' so do NOT add an extra '[' here.
      you:      `${ESC}38;5;84m`,   // bright seafoam-green  — the human / input side
      model:    `${ESC}38;5;215m`,  // soft peach-amber      — the AI model
      provider: `${ESC}38;5;147m`,  // periwinkle-violet     — the provider gateway
    }
  : ({} as Record<string, string>);

function paint(color: string, text: string): string {
  return color && supportsColor() ? `${color}${text}${C.reset ?? ''}` : text;
}

export const ansi = {
  bold:     (s: string) => paint(C.bold ?? '', s),
  dim:      (s: string) => paint(C.dim ?? '', s),
  italic:   (s: string) => paint(C.italic ?? '', s),
  underline:(s: string) => paint(C.underline ?? '', s),
  red:      (s: string) => paint(C.red ?? '', s),
  green:    (s: string) => paint(C.green ?? '', s),
  yellow:   (s: string) => paint(C.yellow ?? '', s),
  blue:     (s: string) => paint(C.blue ?? '', s),
  cyan:     (s: string) => paint(C.cyan ?? '', s),
  bgCyan:   (s: string) => paint(C.bgCyan ?? '', s),
  magenta:  (s: string) => paint(C.magenta ?? '', s),
  gray:     (s: string) => paint(C.gray ?? '', s),
  accent:   (s: string) => paint(C.cyan ?? '', s),
  // Distinct palettes so "you" and "the model" read as separate entities.
  you:      (s: string) => paint(C.you ?? '', s),
  model:    (s: string) => paint(C.model ?? '', s),
  provider: (s: string) => paint(C.provider ?? '', s),
};

/* ---- Banner -------------------------------------------------------- */
/*
  The ASCII logo mirrors the SVG exactly:
    • 2 concentric rings  (inner solid, outer dashed)
    • 8 radial spokes at 45° intervals
    • 8 outer nodes  (circle ○ with centre dot ●)
    • "AIOS" centre text
  Rendered at ~17×17 chars, placed left of the block-letter title.
*/

// Block-letter glyphs for A · I · O · S  (7 rows × 5 cols each, space-separated)
const BLOCK: Record<string, string[]> = {
  A: [
    ' ▄▄▄ ',
    '▐█▄█▌',
    '▐█ █▌',
    '▐███▌',
    '▐█ █▌',
    '▐█ █▌',
    '▀   ▀',
  ],
  I: [
    '▄███▄',
    '  █  ',
    '  █  ',
    '  █  ',
    '  █  ',
    '  █  ',
    '▀███▀',
  ],
  O: [
    ' ▄█▄ ',
    '█   █',
    '█   █',
    '█   █',
    '█   █',
    '█   █',
    ' ▀█▀ ',
  ],
  S: [
    ' ████',
    '█    ',
    '█    ',
    ' ▀▀▄ ',
    '    █',
    '    █',
    '████ ',
  ],
};

// ASCII art of the circular logo (17 rows × 19 cols)
// Mirrors the SVG: inner ring (┼/─/│), outer ring (· dashes), spokes (╌/╎), nodes (◉)
const LOGO_ROWS = [
  '     ◉  ╎  ◉     ',
  '   ╌╌   │   ╌╌   ',
  '  ◉   ╭─┼─╮   ◉  ',
  '  ╎  ╭┘ │ └╮  ╎  ',
  '──◉──┤  │  ├──◉──',
  '  ╎  ╰╮ │ ╭╯  ╎  ',
  '  ◉   ╰─┼─╯   ◉  ',
  '   ╌╌   │   ╌╌   ',
  '     ◉  ╎  ◉     ',
];

/** Build the banner as an array of ANSI-coloured lines.
 *  Exported so the REPL can inject them into the scrollback log
 *  (instead of printing to stdout, which the REPL's screen-erase redraw
 *  would immediately wipe). */
export function getBannerLines(version: string): string[] {
  const w = (process.stdout.columns || 80);
  const useRich = w >= 72 && supportsColor();

  if (!useRich) {
    return [
      '',
      `  ${ansi.cyan('◈')} ${ansi.bold(ansi.cyan('AIOS'))} ${ansi.gray('· AI Agent Operating System')}`,
      `  ${ansi.dim('agentic command line')}  ${ansi.gray(`v${version}`)}`,
      `  ${ansi.dim('─'.repeat(54))}`,
      '',
    ];
  }

  // --- Build block-letter "AIOS" lines (7 rows) ---
  const letters = ['A', 'I', 'O', 'S'];
  const titleRows: string[] = [];
  for (let r = 0; r < 7; r++) {
    const colors = [C.provider, C.model, C.cyan, C.provider] as const;
    const row = letters
      .map((l, i) => paint(colors[i] ?? '', BLOCK[l]![r] ?? '     '))
      .join('  ');
    titleRows.push(row);
  }

  const logoColor = `${ESC}38;5;75m`;
  const nodeColor = `${ESC}38;5;214m`;
  const spokeColor = `${ESC}38;5;141m`;

  const colorLogo = (row: string): string =>
    row.split('').map((ch) => {
      if (ch === '◉') return `${nodeColor}${ch}${C.reset}`;
      if ('╌╎│─'.includes(ch)) return `${spokeColor}${ch}${C.reset}`;
      if ('╭╮╯╰┘└┼├┤'.includes(ch)) return `${logoColor}${ch}${C.reset}`;
      return ch;
    }).join('');

  const lines: string[] = [''];

  const titleOffset = 1;
  for (let i = 0; i < LOGO_ROWS.length; i++) {
    const logoCol = '  ' + colorLogo(LOGO_ROWS[i]!);
    const titleIdx = i - titleOffset;
    const titleCol = titleIdx >= 0 && titleIdx < titleRows.length
      ? '    ' + titleRows[titleIdx]!
      : '';
    lines.push(logoCol + titleCol);
  }

  lines.push('');
  lines.push(
    '  ' + ansi.dim('──────────────────') +
    '    ' + ansi.gray('AI Agent Operating System') +
    '  ' + ansi.dim(`v${version}`),
  );
  lines.push(
    '  ' + ansi.dim('                  ') +
    '    ' + ansi.dim('agentic command line · /help for commands'),
  );
  lines.push('');

  return lines;
}

/** Print the banner directly to stdout (one-shot mode / --help context). */
export function printBanner(version: string): void {
  process.stdout.write(getBannerLines(version).join('\n') + '\n');
}

/* ---- Slash command registry --------------------------------------- */

export interface SlashCommand {
  name: string;
  description: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: '/help',     description: 'Show help and all available commands' },
  { name: '/model',    description: 'Open interactive model picker  (or /model <id>)' },
  { name: '/provider', description: 'Open interactive provider picker  (list / set / add)' },
  { name: '/status',   description: 'Show current provider · model · session info' },
  { name: '/tokens',   description: 'Estimate token usage for the current conversation' },
  { name: '/clear',    description: 'Clear the conversation history' },
  { name: '/explain',  description: 'Prefix — explain the selection / project' },
  { name: '/refactor', description: 'Prefix — refactor the code' },
  { name: '/fix',      description: 'Prefix — find and fix errors' },
  { name: '/test',     description: 'Prefix — generate tests' },
  { name: '/plan',     description: 'Draft a plan before acting' },
  { name: '/theme',    description: 'Customize message bubble colors' },
  { name: '/composer', description: 'Adjust temperature, max tokens, and reasoning toggles' },
  { name: '/exit',     description: 'Quit the CLI' },
];

/* ---- Markdown renderer --------------------------------------------- */
/* Mirrors the desktop app's custom parser (parseSegments / parseBlocks /
   renderInline) but emits ANSI. Fenced code blocks get a titled, boxed
   treatment; headings, lists, quotes and inline styles are coloured. */

function wrap(text: string, width: number, indent: string): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + ' ' + w).length <= width) cur += ' ' + w;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.map((l) => indent + l).join('\n');
}

function renderInline(text: string): string {
  // Bold **x**, italic *x*, inline `code`.
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text.startsWith('**', i)) {
      const end = text.indexOf('**', i + 2);
      if (end > i) {
        out += ansi.bold(text.slice(i + 2, end));
        i = end + 2;
        continue;
      }
    }
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > i) {
        out += ansi.cyan(text.slice(i + 1, end));
        i = end + 1;
        continue;
      }
    }
    if (text[i] === '*' && text[i + 1] !== '*' && text[i - 1] !== '*') {
      const end = text.indexOf('*', i + 1);
      if (end > i) {
        out += ansi.italic(text.slice(i + 1, end));
        i = end + 1;
        continue;
      }
    }
    out += text[i];
    i++;
  }
  return out;
}

export function renderMarkdown(markdown: string): string {
  const termWidth = (process.stdout.columns || 80) - 6;
  const segments = parseSegments(markdown);
  const blocks: string[] = [];

  for (const seg of segments) {
    if (seg.type === 'code') {
      const lang = seg.lang ? ansi.gray(` ${seg.lang} `) : '';
      const header = `  ${ansi.dim('┌')}${ansi.cyan('◇')}${lang}${ansi.dim('─'.repeat(Math.max(2, termWidth - lang.length - 4)))}`;
      const body = seg.code
        .split('\n')
        .map((l) => '  ' + ansi.dim('│ ') + l)
        .join('\n');
      const footer = `  ${ansi.dim('└')}${'─'.repeat(termWidth)}`;
      blocks.push(`${header}\n${body}\n${footer}`);
      continue;
    }
    blocks.push(renderBlocks(seg.text, termWidth));
  }
  return blocks.join('\n');
}

export let userThemeColor = 'cyan';
export let agentThemeColor = 'green';

export function setThemeColors(user: string, agent: string) {
  userThemeColor = user;
  agentThemeColor = agent;
}

export function getThemeColorFn(name: string) {
  switch (name) {
    case 'red': return ansi.red;
    case 'green': return ansi.green;
    case 'yellow': return ansi.yellow;
    case 'blue': return ansi.blue;
    case 'magenta': return ansi.magenta;
    case 'cyan': return ansi.cyan;
    case 'gray': return ansi.gray;
    case 'seafoam': return ansi.you;
    case 'peach': return ansi.model;
    case 'periwinkle': return ansi.provider;
    default: return ansi.gray;
  }
}

export function renderBubble(role: 'user' | 'assistant', header: string, content: string): string {
  const termWidth = Math.min((process.stdout.columns || 80) - 6, 86);
  const userFn = getThemeColorFn(userThemeColor);
  const agentFn = getThemeColorFn(agentThemeColor);
  const color = role === 'user' ? userFn : agentFn;
  
  const title = `  ${role === 'user' ? '\u25c8 you' : '\u25c9 aios'} \u00b7 ${header} `;
  const borderLen = Math.max(2, termWidth - title.length - 3);
  const top = color(`  \u250c\u2500${title}${"\u2500".repeat(borderLen)}\u2510`);
  
  const contentWidth = termWidth - 4;
  const rawLines = content.replace(/\t/g, '  ').split('\n');
  const lines: string[] = [];
  
  for (const rawLine of rawLines) {
    let l = rawLine.replace(/\r/g, '');
    if (!l.trim()) {
      lines.push('');
      continue;
    }
    // Simple wrap
    while (l.length > contentWidth) {
      let splitIdx = l.lastIndexOf(' ', contentWidth);
      if (splitIdx <= 0) splitIdx = contentWidth;
      lines.push(l.slice(0, splitIdx));
      l = l.slice(splitIdx).trim();
    }
    if (l) lines.push(l);
  }

  // Remove leading and trailing empty lines to prevent vertical strays inside the bubble box
  while (lines.length > 0 && lines[0] === '') {
    lines.shift();
  }
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  
  const body = lines.map((l) => {
    const padded = l.padEnd(contentWidth);
    const textColor = role === 'user' ? userFn : agentFn;
    return color('  \u2502 ') + textColor(padded) + color(' \u2502');
  }).join('\n');
  
  const bottom = color(`  \u2514${"\u2500".repeat(termWidth - 2)}\u2518`);
  return body.length ? `${top}\n${body}\n${bottom}` : `${top}\n${bottom}`;
}

function highlightLine(line: string): string {
  const tokenRegex = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|('(?:\\.|[^'])*'|"(?:\\.|[^"])*"|`(?:\\.|[^`])*`)|(\b(?:const|let|var|function|return|class|interface|type|import|export|from|default|if|else|for|while|async|await|try|catch|finally|throw|new|extends|implements|public|private|protected|readonly|as)\b)|(\b\d+\b|\b(?:true|false|null|undefined)\b)|(\b[a-zA-Z_][a-zA-Z0-9_]*(?=\s*\())/g;

  return line.replace(tokenRegex, (match, comment, str, keyword, literal, func) => {
    if (comment) return ansi.dim(match);     // comments in dim gray
    if (str) return ansi.green(match);       // strings in green
    if (keyword) return ansi.magenta(match); // keywords in magenta
    if (literal) return ansi.cyan(match);    // literals/numbers/booleans in cyan
    if (func) return ansi.yellow(match);     // functions in yellow
    return match;
  });
}

export function renderEditorSnippet(sink: TurnSink, name: string, detail: string, extra: any): void {
  const cols = Math.min((process.stdout.columns || 80) - 6, 86);
  const contentWidth = cols - 6;
  
  // Header border: ┌─ ❖  Editor ──────────────────┐
  const titleText = `─ ❖  Editor `;
  const dashCount = (contentWidth + 2) - titleText.length;
  const header = `  ${ansi.dim('┌')}${ansi.yellow(titleText)}${ansi.dim('─'.repeat(Math.max(0, dashCount)))}${ansi.dim('┐')}`;
  sink.line(header);

  const formatInnerLine = (prefix: string, content: string): string => {
    const prefixClean = prefix.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
    const prefixWidth = prefixClean.length;
    const availableWidth = contentWidth - prefixWidth;
    
    const cleanContent = content.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
    let displayContent = content;
    
    if (cleanContent.length > availableWidth) {
      const truncatedLen = availableWidth - 3;
      displayContent = highlightLine(cleanContent.slice(0, truncatedLen)) + ansi.dim('...');
    } else {
      displayContent = highlightLine(cleanContent);
    }
    
    const cleanDisplay = displayContent.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
    const padding = ' '.repeat(Math.max(0, availableWidth - cleanDisplay.length));
    
    return `  ${ansi.dim('│')} ${prefix}${displayContent}${padding} ${ansi.dim('│')}`;
  };

  if (extra.patch) {
    sink.line(`  ${ansi.dim('│')} ${ansi.gray(padLine('Surgical Patch:', contentWidth))} ${ansi.dim('│')}`);
    const oldLines = extra.old_str.split('\n');
    for (const l of oldLines) {
      sink.line(formatInnerLine(ansi.red('- '), l));
    }
    const newLines = extra.new_str.split('\n');
    for (const l of newLines) {
      sink.line(formatInnerLine(ansi.green('+ '), l));
    }
  } else if (extra.append) {
    sink.line(`  ${ansi.dim('│')} ${ansi.gray(padLine('Appended Code:', contentWidth))} ${ansi.dim('│')}`);
    const codeLines = extra.content.split('\n');
    for (const l of codeLines) {
      sink.line(formatInnerLine(ansi.green('+ '), l));
    }
  } else {
    sink.line(`  ${ansi.dim('│')} ${ansi.gray(padLine('Written File Content:', contentWidth))} ${ansi.dim('│')}`);
    const codeLines = extra.content.split('\n');
    const preview = codeLines.slice(0, 15);
    for (let i = 0; i < preview.length; i++) {
      const lineNum = String(i + 1).padStart(3, ' ');
      sink.line(formatInnerLine(ansi.dim(lineNum + ' '), preview[i]));
    }
    if (codeLines.length > 15) {
      const remaining = codeLines.length - 15;
      const msg = `... (${remaining} more lines) ...`;
      sink.line(`  ${ansi.dim('│')} ${ansi.dim(padLine(msg, contentWidth))} ${ansi.dim('│')}`);
    }
  }

  // Footer: └────────────────────────────────────┘
  const footer = `  ${ansi.dim('└')}${ansi.dim('─'.repeat(contentWidth + 2))}${ansi.dim('┘')}`;
  sink.line(footer);
}

function padLine(str: string, width: number): string {
  const clean = str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  if (clean.length >= width) {
    return str.slice(0, str.length - (clean.length - width));
  }
  return str + ' '.repeat(width - clean.length);
}


type Segment =
  | { type: 'text'; text: string }
  | { type: 'code'; lang?: string; code: string };

function parseSegments(content: string): Segment[] {
  const out: Segment[] = [];
  const re = /```(\w*)[^\S\r\n]*\r?\n?([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    if (m.index > last) out.push({ type: 'text', text: content.slice(last, m.index) });
    out.push({ type: 'code', lang: m[1] || undefined, code: m[2].replace(/\n$/, '') });
    last = re.lastIndex;
  }
  if (last < content.length) out.push({ type: 'text', text: content.slice(last) });
  return out;
}

function renderBlocks(text: string, width: number): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let listN = 0;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      out.push('');
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      out.push('  ' + ansi.bold(ansi.cyan('#'.repeat(level) + ' ' + renderInline(h[2]))));
      continue;
    }
    const q = /^>\s?(.*)$/.exec(line);
    if (q) {
      out.push(wrap(renderInline(q[1]), width, '  ' + ansi.gray('│ ') ));
      continue;
    }
    const ol = /^(\d+)\.\s+(.*)$/.exec(line);
    if (ol) {
      listN = Number(ol[1]);
      out.push('  ' + ansi.cyan(`${listN}.`) + ' ' + renderInline(ol[2]));
      continue;
    }
    const ul = /^[-*]\s+(.*)$/.exec(line);
    if (ul) {
      out.push('  ' + ansi.cyan('•') + ' ' + renderInline(ul[1]));
      continue;
    }
    out.push(wrap(renderInline(line), width, '  '));
  }
  return out.join('\n');
}

/* ---- Streaming turn UI --------------------------------------------- */

/** A sink the turn UI writes through. The REPL supplies one that captures
 *  output into its scrollback log; the one-shot mode uses the stdout sink. */
export interface TurnSink {
  /** Append raw text to the current (last) line. */
  write(s: string): void;
  /** Finish the current line and start a new one (optionally with text). */
  line(s?: string): void;
  /** Show/update a transient spinner line (e.g. "thinking…"). Pass '' to clear. */
  spinner(s?: string): void;
}

export const stdoutSink: TurnSink = {
  write: (s) => process.stdout.write(s),
  line: (s = '') => process.stdout.write(s + '\n'),
  spinner: () => {},
};

export interface TurnUI {
  start(): void;
  onToken(delta: string): void;
  onTool(name: string, detail: string): void;
  finish(result: { provider: string; model: string; toolCalls: number }): void;
  error(message: string): void;
}

/** Per-tool visual identity — Unicode geometric icon + distinct colour.
 *  Each badge is: coloured-symbol  dim-separator  coloured-label.
 *  No emojis, no Nerd Font needed — pure Unicode + ANSI. */
export function toolBadge(name: string, detail: string = ''): string {
  // ── icon definitions ─────────────────────────────────────────────────
  type BadgeDef = { sym: string; col: (s: string) => string; label: string };
  const DEFS: Record<string, BadgeDef> = {
    read_file:    { sym: '\u25c2',  col: ansi.cyan,     label: 'read'    },
    write_file:   { sym: '\u25c3',  col: ansi.yellow,   label: 'write'   },
    search_code:  { sym: '\u25ce',  col: ansi.magenta,  label: 'search'  },
    list_dir:     { sym: '\u25a4',  col: ansi.blue,     label: 'dir'     },
    run_command:  { sym: '\u25b6',  col: ansi.green,    label: 'run'     },
    git_commit:   { sym: '\u25c8',  col: ansi.provider, label: 'commit'  },
    git_status:   { sym: '\u25c7',  col: ansi.provider, label: 'status'  },
    change_dir:   { sym: '\u21aa',  col: ansi.cyan,     label: 'cd'      },
    pwd:          { sym: '\u25c9',  col: ansi.gray,     label: 'pwd'     },
    wait:         { sym: '\u25cc',  col: ansi.dim,      label: 'wait'    },
  };
  const d: BadgeDef = DEFS[name] ?? { sym: '\u25c6', col: ansi.gray, label: name };
  const icon  = d.col(ansi.bold(d.sym));
  const label = d.col(d.label);
  const sep   = ansi.dim('  ');

  // Parse diff annotation "+N -N" embedded in detail (from write_file / patch_file).
  // Display path in gray, then green +added and red -removed line counts.
  const diffMatch = detail.match(/^(.+?)\s{2,}\+(\d+)(?:\s+-?(\d+))?$/);
  let info: string;
  if (diffMatch) {
    const [, filePath, added, removed] = diffMatch;
    info = ansi.gray('  ' + (filePath ?? '').trim())
      + '  ' + ansi.green('+' + added)
      + (removed ? '  ' + ansi.red('-' + removed) : '');
  } else {
    info = detail ? ansi.gray('  ' + detail.slice(0, 72)) : '';
  }

  return `  ${icon}${sep}${label}${info}`;
}

/** @deprecated Use toolBadge instead. */
export function toolGlyph(name: string): string {
  const sym: Record<string, string> = {
    read_file: '◂', write_file: '◃', search_code: '◎',
    list_dir: '▤',  run_command: '▶', git_commit: '◈',
    git_status: '◇', change_dir: '↪', pwd: '◉', wait: '◌',
  };
  return sym[name] ?? '◆';
}

export function createTurnUI(model: string, sink: TurnSink = stdoutSink): TurnUI {
  // Buffer: accumulates ALL streamed tokens so the spinner can show a
  // rolling reasoning preview AND so runTurn can format the final response.
  let tokenBuf       = '';
  let spinnerCleared = false;

  const clearSpinnerOnce = () => {
    if (!spinnerCleared) { spinnerCleared = true; sink.spinner(''); }
  };

  // Rolling preview: last 70 chars of the token buffer, single-spaced.
  const reasoningPreview = () => {
    const raw = tokenBuf.replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').trimStart();
    return raw.length > 70 ? '\u2026' + raw.slice(-68) : raw;
  };

  return {
    start() {

      spinnerCleared = false;
      tokenBuf = '';
      sink.spinner('thinking');
    },
    onToken(delta: string) {
      tokenBuf += delta;
      // Keep the spinner alive with the full accumulated token buffer
      sink.spinner(tokenBuf || 'thinking');
    },
    onTool(name: string, detail: string) {
      // Clear the spinner, write the badge, then restart spinner for next step.
      clearSpinnerOnce();
      sink.line(toolBadge(name, detail));
      spinnerCleared = false;
      tokenBuf = ''; // Reset the token buffer for the next round of thinking!
      sink.spinner('thinking');
    },
    finish(result) {

      clearSpinnerOnce();
      sink.line();
      const toolBit = result.toolCalls
        ? ansi.dim(` \u00b7 ${result.toolCalls} tool call${result.toolCalls === 1 ? '' : 's'}`)
        : '';
      sink.line(
        ansi.gray(`  \u21b3 ${result.provider}`) +
        ansi.dim(' \u00b7 ') +
        ansi.model(result.model) +
        toolBit,
      );
    },
    error(message: string) {

      clearSpinnerOnce();
      const [firstLine = message, ...rest] = message.split('\n');
      const w = Math.min((process.stdout.columns || 80) - 4, 72);
      const bar = (s: string) => ansi.red('  \u2502 ') + s;
      sink.line(ansi.red('  \u250c\u2500 \u2716 error ' + '\u2500'.repeat(Math.max(2, w - 9))));
      sink.line(bar(ansi.bold(ansi.red(firstLine))));
      for (const l of rest) sink.line(bar(ansi.gray(l.trim())));
      sink.line(ansi.red('  \u2514' + '\u2500'.repeat(w)));
    },
  };
}

/* ---- Interactive REPL input ---------------------------------------- */
/* Mirrors the desktop composer's slash menu: typing `/` opens a popup
   of every slash command, ↑/↓ move the selection, Enter/Tab accepts
   the highlighted command into the input, Esc closes the menu. Enter
   (with no popup) sends the message; ↑/↓ on a normal line recall
   history; Ctrl+C / Ctrl+D quit. Implemented as a small raw-mode line
   editor so we control the popup rendering and key handling directly
   (readline's completer can only Tab-fill text, not show a popup). */

export interface ReplStatus {
  provider: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  reasoningLevel?: string;
}

export interface ReplCallbacks {
  onLine: (line: string, ctx: { sink: TurnSink }) => void | Promise<void>;
  onExit?: () => void;
  onAbort?: () => void;
  prompt?: string;
  /** Initial provider · model shown in the (pinned) input bar. */
  status?: ReplStatus;
}

import { Modal, type ModalPage, type ModalController, type ModalOutcome, type ModalItem } from './modal';

export type { ModalPage, ModalController, ModalOutcome, ModalItem };

/**
 * Start the interactive REPL.
 *
 * Layout model (full-screen redraw): a scrollback `log` of past output sits
 * above a single pinned input bar at the bottom of the terminal. Every change
 * repaints the whole visible region, so the input line never drifts and there
 * are no leftover "scars" from popups or streaming output. The input bar shows
 * the active provider · model with distinct palettes (kept current via
 * `setStatus`).
 *
 * Exposes `openModal(root, controller)` (the browser-style popup),
 * `setStatus(status)` (update the provider · model chip) and `writer` (a turn
 * sink that streams live activity — thinking, tool calls, answers — into the
 * scrollback without overflowing).
 */
export function startRepl(cb: ReplCallbacks): {
  close: () => void;
  openModal: (root: ModalPage, controller: ModalController) => Promise<ModalOutcome>;
  setStatus: (status: ReplStatus) => void;
  writer: TurnSink;
} {
  const out = process.stdout;
  const stdin = process.stdin;
  let status: ReplStatus = cb.status ?? { provider: '', model: '' };

  let buf = '';
  let pastedText = '';
  let isPasting = false;
  let pasteBuffer = '';
  let busy = false;
  let turnStartTime = 0;
  let busyTick: NodeJS.Timeout | null = null;
  let busyIdx = 0;
  const BUSY_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let slashDismissed = false;
  let slashIndex = 0;
  let ignoreKeypress = false;
  let insideMouseSequence = false;

  let logScrollOffset = 0;
  let pasteExpanded = false;
  let isSelected = false;
  let cutBuffer = '';

  let activeModal: InstanceType<typeof Modal> | null = null;

  // Scrollback log — each entry is one fully-formatted (ANSI) line.
  const log: string[] = [];
  // The last log line may be a live, in-progress stream (answer text / spinner).
  // When we start a fresh committed line we drop the transient tail.
  let liveTail = '';

  // History of submitted lines (most-recent last).
  const history: string[] = [];
  let histIdx = -1; // -1 = current (not yet submitted) line

  // Queue for input messages typed while agent is busy running a turn
  const queue: string[] = [];



  readline.emitKeypressEvents(stdin);
  if (stdin.isTTY) {
    stdin.setRawMode(true);
    out.write('\x1b[?1000h\x1b[?1006h\x1b[?2004h'); // enable SGR mouse and bracketed paste mode
  }
  stdin.resume();

  /** Append a committed line to the scrollback and repaint. */
  const appendLine = (s: string): void => {
    log.push(s);
    liveTail = '';
    logScrollOffset = 0;
    redraw();
  };
  /** Repaint the whole visible region: log (top) + slash popup + input bar. */
  let spinnerTimer: NodeJS.Timeout | null = null;
  const redraw = (): void => {
    if (activeModal) return; // the modal owns the screen while open
    const rows = (out as any).rows || 40;
    const cols = (out as any).columns || 80;
    const { open, items } = computeSlash();
    const showSlash = open && items.length > 0;

    const popup = showSlash
      ? items.map((c, i) => {
          const sel = i === slashIndex;
          const mark = sel ? ansi.cyan('❯ ') : '  ';
          return mark + ansi.bold(c.name) + '  ' + ansi.gray(c.description ?? '');
        })
      : [];

    const slicedLog = logScrollOffset > 0 ? log.slice(0, -logScrollOffset) : log;
    const above = [...slicedLog];
    if (thinkExpanded && spinText && spinTick) {
      // Expanded thinking panel: bordered multi-line box instead of spinner line.
      for (const l of mkThinkBox(cols)) above.push(l);
    } else if (liveTail) {
      above.push(liveTail);
    }
    above.push(...popup);

    if (pastedText && pasteExpanded) {
      for (const l of mkPasteBox(cols)) above.push(l);
    }

    const pasteBoxLines = (pastedText && pasteExpanded)
      ? Math.min(12, pastedText.split(/\r?\n/).length + 2)
      : 0;
    const bottomHeight = busy ? 6 : 5;
    const available = Math.max(0, rows - bottomHeight - pasteBoxLines);
    const visible = above.slice(-available);
    // Pad BELOW content (empty rows at bottom before input bar) so the
    // banner and first lines always render at the top of the screen.
    while (visible.length < available) visible.push('');

    // Line 1: User Typing Line
    const youChip = paint(C.bold ?? '', ansi.cyan(' ◈ you '));
    const sep     = ansi.dim(' › ');
    let displayBuf = buf;
    if (isSelected && buf.length > 0) {
      displayBuf = ansi.bgCyan(buf);
    }
    if (pastedText) {
      const lineCount = pastedText.split(/\r?\n/).length;
      const stateMsg = pasteExpanded ? 'click to collapse' : 'click to expand';
      displayBuf = ansi.yellow(`(~${lineCount} lines pasted · ${stateMsg}) `) + displayBuf;
    } else if (logScrollOffset > 0) {
      displayBuf = ansi.yellow(`(▲ Scrolled Up · ${logScrollOffset} lines) `) + displayBuf;
    }
    const typingLine = youChip + sep + displayBuf;

    // Line 2: Composer Box (Divider + Parameters)
    const divider = ansi.dim('  ' + '─'.repeat(Math.max(10, cols - 6)));

    const modelStr = status.model ? status.model : 'no model';
    const providerStr = status.provider ? status.provider : 'no provider';
    const tempStr = status.temperature != null ? status.temperature.toString() : 'default';
    const maxStr = status.maxTokens != null ? status.maxTokens.toLocaleString() : 'default';
    const reasonStr = status.reasoningLevel ?? 'medium';

    const settingsText = ` ⚙  ${ansi.bold(providerStr)} / ${ansi.bold(modelStr)}  ·  temp: ${ansi.cyan(tempStr)}  ·  max_tokens: ${ansi.cyan(maxStr)}  ·  reasoning: ${ansi.cyan(reasonStr)}`;
    const paddedSettings = '  ' + settingsText;

    const controlDivider = ansi.dim('  ' + '─'.repeat(Math.max(10, cols - 6)));
    const controlText = ` ⌨  ${ansi.bold('[Esc]')} Abort  ·  ${ansi.bold('[Tab]')} Commands  ·  ${ansi.bold('[Ctrl+A]')} Select All  ·  ${ansi.bold('[Ctrl+X]')} Cut  ·  ${ansi.bold('[Ctrl+C]')} Quit`;
    const paddedControls = '  ' + controlText;

    const linesToDraw = [
      ...visible,
      typingLine,
      divider,
      paddedSettings,
      controlDivider,
      paddedControls
    ];

    if (busy) {
      const totalSec = Math.floor((Date.now() - (turnStartTime || Date.now())) / 1000);
      let elapsedStr = `${totalSec}s`;
      if (totalSec >= 60) {
        const m = Math.floor(totalSec / 60);
        const s = totalSec % 60;
        elapsedStr = `${m}m ${s}s`;
      }
      const frame = BUSY_FRAMES[busyIdx % BUSY_FRAMES.length];
      const statusLine = `  ${ansi.cyan('✦')}  ${ansi.gray('AIOS is working')}  ${ansi.cyan(`[ ${frame} ]`)}  ${ansi.dim(`elapsed: ${elapsedStr}`)}`;
      linesToDraw.push(statusLine);
    }

    // Write everything in a single, flicker-free pass using home + individual EOL clears
    const drawString = '\x1b[H' + linesToDraw.map((l) => l + '\x1b[K').join('\n') + '\x1b[J';
    out.write(drawString);

    // Position cursor at the end of typing line inside input field
    if (!activeModal) {
      const cursorLine = linesToDraw.length - (busy ? 5 : 4);
      const cleanTypingLine = typingLine.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
      const cursorCol = cleanTypingLine.length + 1;
      out.write(`\x1b[${cursorLine};${cursorCol}H\x1b[?25h`);
    }
    void spinnerTimer;
  };

  const computeSlash = () => {
    const open = buf.startsWith('/') && !buf.includes(' ') && buf.length > 0 && !slashDismissed;
    const items = open
      ? SLASH_COMMANDS.filter((c) => c.name.startsWith(buf))
      : [];
    return { open, items };
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Turn sink — every write is folded into the scrollback and repainted.
  // ──────────────────────────────────────────────────────────────────────────

  // Spinning-disk animation — half-filled circles at 90° intervals.
  const SPIN = ['\u25d0', '\u25d3', '\u25d1', '\u25d2']; // ◐◓◑◒
  let spinIdx  = 0;
  let spinText = '';         // full accumulated reasoning text
  let spinTick: NodeJS.Timeout | null = null;
  let thinkExpanded = true;  // 'T' key toggles this; defaults to true (paragraphs)

  const clearSpin = () => {
    if (spinTick) { clearInterval(spinTick); spinTick = null; }
    spinText = '';
    thinkExpanded = true;    // reset for next turn
  };

  // Collapsed spinner line: one-liner with last 63 chars of reasoning.
  const mkSpinLine = () => {
    const frame   = SPIN[spinIdx % SPIN.length]!;
    const cleanText = spinText.replace(/<\/?think>/gi, '').trim();
    const flat    = cleanText.replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').trimStart();
    const preview = flat.length > 63 ? '\u2026' + flat.slice(-61) : flat;
    const hint    = spinText.length > 10 ? ansi.dim('  [t] expand') : '';
    return `  ${ansi.model(frame)}  ${ansi.dim(preview)}${hint}`;
  };

  // Expanded thinking box: bordered multi-line panel with word-wrapped paragraphs.
  const mkThinkBox = (cols: number) => {
    const w = Math.min(cols - 6, 86);
    const contentWidth = w - 6; // text width inside borders (w - 2 margin spaces - 2 padding spaces - 2 borders)
    const frame = SPIN[spinIdx % SPIN.length]!;
    const box: string[] = [];
    
    // Top border: ┌─ ◕ thinking ─────── [T] ─┐
    const titleText = `─ ${frame} thinking `;
    const controlText = ` [T] ─`;
    const dashCount = (contentWidth + 2) - titleText.length - controlText.length;
    
    box.push(
      ansi.dim('  ┌') +
      ansi.dim(`─ ${ansi.model(frame)} thinking `) +
      ansi.dim('─'.repeat(Math.max(0, dashCount))) +
      ansi.dim(controlText) +
      ansi.dim('┐')
    );

    const cleanText = spinText.replace(/<\/?think>/gi, '').trim();
    const rawParagraphs = cleanText.split('\n');
    const wrappedLines: string[] = [];
    
    for (const p of rawParagraphs) {
      let l = p.trim();
      if (!l) continue;
      while (l.length > contentWidth) {
        let splitIdx = l.lastIndexOf(' ', contentWidth);
        if (splitIdx <= 0) splitIdx = contentWidth;
        wrappedLines.push(l.slice(0, splitIdx));
        l = l.slice(splitIdx).trim();
      }
      if (l) wrappedLines.push(l);
    }

    // Show up to 15 lines of thoughts (scrolling view)
    const showLines = wrappedLines.slice(-15);
    for (const line of showLines) {
      const padded = line.padEnd(contentWidth, ' ');
      box.push(ansi.dim('  │ ') + ansi.gray(padded) + ansi.dim(' │'));
    }
    
    box.push(ansi.dim('  └' + '─'.repeat(contentWidth + 2) + '┘'));
    return box;
  };

  const mkPasteBox = (cols: number) => {
    const w = Math.min(cols - 6, 86);
    const contentWidth = w - 6; // text width inside borders (w - 2 margin spaces - 2 padding spaces - 2 borders)
    const box: string[] = [];
    
    // Top border: ┌─ Paste Preview ────────────────┐
    const titleText = `─ Paste Preview `;
    const dashCount = (contentWidth + 2) - titleText.length;
    
    box.push(
      ansi.dim('  ┌') +
      ansi.dim(titleText) +
      ansi.dim('─'.repeat(Math.max(0, dashCount))) +
      ansi.dim('┐')
    );

    const rawLines = pastedText.split(/\r?\n/);
    const wrappedLines: string[] = [];
    
    for (const p of rawLines) {
      let l = p;
      if (!l) {
        wrappedLines.push('');
        continue;
      }
      while (l.length > contentWidth) {
        let splitIdx = l.lastIndexOf(' ', contentWidth);
        if (splitIdx <= 0) splitIdx = contentWidth;
        wrappedLines.push(l.slice(0, splitIdx));
        l = l.slice(splitIdx);
      }
      if (l) wrappedLines.push(l);
    }

    // Show up to 10 lines of preview
    const showLines = wrappedLines.slice(0, 10);
    for (const line of showLines) {
      const padded = line.padEnd(contentWidth, ' ');
      box.push(ansi.dim('  │ ') + ansi.gray(padded) + ansi.dim(' │'));
    }
    if (wrappedLines.length > 10) {
      const remaining = wrappedLines.length - 10;
      const msg = `... (${remaining} more lines) ...`;
      const padded = msg.padEnd(contentWidth, ' ');
      box.push(ansi.dim('  │ ') + ansi.dim(padded) + ansi.dim(' │'));
    }
    
    box.push(ansi.dim('  └' + '─'.repeat(contentWidth + 2) + '┘'));
    return box;
  };

  const writer: TurnSink = {
    write: (s) => {
      // Append to live line (used for non-spinner streaming paths).
      liveTail = liveTail + s;
      logScrollOffset = 0;
      redraw();
    },
    line: (s = '') => {
      if (liveTail) {
        if (!spinTick) {
          log.push(liveTail);
        }
        liveTail = '';
      }
      if (s.length) log.push(s);
      logScrollOffset = 0;
      redraw();
    },
    spinner: (s = '') => {
      if (!s) {
        // Stop spinner, clear live line.
        clearSpin();
        liveTail = '';
        redraw();
        return;
      }
      // Update text.  Only START a new interval if one isn’t already running.
      // This prevents the animation frame from resetting on every token delta.
      spinText = s;
      if (!spinTick) {
        spinIdx  = 0;
        spinTick = setInterval(() => {
          spinIdx  = (spinIdx + 1) % SPIN.length;
          liveTail = mkSpinLine();
          redraw();
        }, 100);
      }
      liveTail = mkSpinLine();
      redraw();
    },
  };

  const submit = async () => {
    let line = buf;
    if (pastedText) {
      line = pastedText + (buf ? '\n' + buf : '');
    }
    if (!line.trim()) {
      redraw();
      return;
    }
    history.push(line);
    histIdx = -1;
    buf = '';
    pastedText = '';
    slashDismissed = false;
    slashIndex = 0;
    isSelected = false;
    pasteExpanded = false;
    busy = true;
    turnStartTime = Date.now();
    busyIdx = 0;
    if (!busyTick) {
      busyTick = setInterval(() => {
        busyIdx++;
        redraw();
      }, 100);
    }
    try {
      await cb.onLine(line, { sink: writer });
      
      // Process queued messages sequentially
      while (queue.length > 0) {
        const nextLine = queue.shift()!;
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const bubble = renderBubble('user', timeStr, nextLine);
        appendLine('');
        for (const l of bubble.split('\n')) {
          appendLine(l);
        }
        appendLine('');
        
        history.push(nextLine);
        await cb.onLine(nextLine, { sink: writer });
      }
    } finally {
      if (busyTick) {
        clearInterval(busyTick);
        busyTick = null;
      }
      // Commit any trailing live text and stop the spinner.
      clearSpin();
      if (liveTail) { log.push(liveTail); liveTail = ''; }
      busy = false;
      turnStartTime = 0;
      redraw();
    }
  };

  const onKey = (_ch: string | undefined, key: any) => {
    if (ignoreKeypress) return;
    if (isPasting) return;
    if (secretPromptActive) return; // a hidden secret prompt owns the input
    // While the selector is open, all keys drive the picker — this must be
    // checked BEFORE the `busy` guard because the picker is awaited inside
    // onLine, which sets busy=true for its whole duration.
    if (activeModal) {
      activeModal.handleKey(_ch, key);
      return;
    }

    // Selection management
    if (key && key.ctrl && key.name === 'a') {
      isSelected = true;
      redraw();
      return;
    }
    if (key && key.ctrl && key.name === 'x') {
      cutBuffer = buf;
      buf = '';
      isSelected = false;
      recompute();
      redraw();
      return;
    }
    if (isSelected) {
      if (key && key.name === 'escape') {
        isSelected = false;
        redraw();
        return;
      }
      if (key && (key.name === 'backspace' || key.name === 'delete')) {
        buf = '';
        isSelected = false;
        recompute();
        redraw();
        return;
      }
      if (key && !key.ctrl && !key.meta && _ch && _ch >= ' ') {
        buf = _ch;
        isSelected = false;
        recompute();
        redraw();
        return;
      }
    }

    if (busy) {
      if (key && key.name === 'escape') {
        queue.length = 0;
        if (cb.onAbort) {
          cb.onAbort();
        }
        return;
      }
      if (!key) {
        if (_ch) buf += _ch;
        redraw();
        return;
      }
      if (key.ctrl && (key.name === 'c' || key.name === 'd')) {
        quit();
        return;
      }
      if (key.name === 'return' || key.name === 'enter' || _ch === '\r' || _ch === '\n') {
        const line = buf;
        buf = '';
        if (line.trim()) {
          queue.push(line);
          appendLine(ansi.gray(`  [Queued] ${line}`));
        } else {
          redraw();
        }
        return;
      }
      if (key.name === 'backspace' || key.name === 'delete' || _ch === '\x7f' || _ch === '\b') {
        buf = buf.slice(0, -1);
        redraw();
        return;
      }
      if (key.name === 'space') {
        buf += ' ';
        redraw();
        return;
      }
      if (!key.ctrl && !key.meta && _ch && _ch >= ' ') {
        buf += _ch;
        redraw();
        return;
      }
      return;
    }

    if (!key) {
      if (_ch) buf += _ch;
      recompute();
      redraw();
      return;
    }
    // Ctrl+C / Ctrl+D → quit.
    if (key.ctrl && (key.name === 'c' || key.name === 'd')) {
      quit();
      return;
    }

    const { open, items } = computeSlash();
    const show = open && items.length > 0;

    if (key.name === 'return') {
      if (show) {
        // If the typed text already equals the highlighted command, submit it
        // directly (one Enter) instead of inserting it with a trailing space.
        if (buf === items[slashIndex].name) {
          void submit();
          return;
        }
        // Accept the highlighted command into the input, keep editing.
        buf = items[slashIndex].name + ' ';
        slashDismissed = false;
        slashIndex = 0;
        recompute();
      } else {
        void submit();
        return;
      }
    } else if (key.name === 'tab') {
      if (show) {
        buf = items[slashIndex].name + ' ';
        slashDismissed = false;
        slashIndex = 0;
        recompute();
      }
    } else if (key.name === 'up') {
      if (show) {
        slashIndex = Math.max(0, slashIndex - 1);
      } else if (history.length) {
        histIdx = histIdx < 0 ? history.length - 1 : Math.max(0, histIdx - 1);
        buf = history[histIdx];
        slashDismissed = false;
      }
    } else if (key.name === 'down') {
      if (show) {
        slashIndex = Math.min(items.length - 1, slashIndex + 1);
      } else if (histIdx >= 0) {
        histIdx += 1;
        if (histIdx >= history.length) {
          histIdx = -1;
          buf = '';
        } else {
          buf = history[histIdx];
        }
        slashDismissed = false;
      }
    } else if (key.name === 'escape') {
      if (show) slashDismissed = true;
    } else if (key.name === 'backspace' || key.name === 'delete') {
      if (buf.length > 0) {
        buf = buf.slice(0, -1);
      } else if (pastedText.length > 0) {
        pastedText = ''; // clear entire pasted block
      }
      slashDismissed = false;
      slashIndex = 0;
      recompute();
    } else if (key.name === 'space') {
      buf += ' ';
      slashDismissed = false;
      slashIndex = 0;
      recompute();
    } else if (!key.ctrl && !key.meta && _ch && _ch >= ' ') {
      buf += _ch;
      slashDismissed = false;
      slashIndex = 0;
      recompute();
    }
    redraw();
  };

  const recompute = () => {
    const { items } = computeSlash();
    if (slashIndex > items.length - 1) slashIndex = Math.max(0, items.length - 1);
  };

  const onData = (dataBuf: Buffer) => {
    if (secretPromptActive) return; // Completely ignore if secret prompt is active!
    let str = dataBuf.toString();

    // Check for SGR mouse reporting sequence start
    if (str.includes('\x1b[<')) {
      insideMouseSequence = true;
    }

    if (insideMouseSequence) {
      ignoreKeypress = true;
      
      // Look for button click matches
      const match = str.match(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/);
      if (match) {
        const button = parseInt(match[1], 10);
        const isRelease = match[4] === 'm';
        if (!isRelease && button === 0) {
          if (busy && spinTick) {
            thinkExpanded = !thinkExpanded;
            liveTail = thinkExpanded ? '' : mkSpinLine();
            redraw();
          }
        } else if (button === 64) {
          if (activeModal) {
            activeModal.handleScroll(-1);
          } else {
            logScrollOffset = Math.min(log.length, logScrollOffset + 1);
            redraw();
          }
        } else if (button === 65) {
          if (activeModal) {
            activeModal.handleScroll(1);
          } else {
            logScrollOffset = Math.max(0, logScrollOffset - 1);
            redraw();
          }
        }
      }

      // Check if mouse sequence ends in this chunk
      if (str.endsWith('M') || str.endsWith('m') || str.includes('M') || str.includes('m')) {
        insideMouseSequence = false;
      }
      return; // prevent keypress/data handling
    }

    ignoreKeypress = false;

    // Check for Bracketed Paste Start
    if (str.includes('\x1b[200~')) {
      isPasting = true;
      pasteBuffer = '';
      const startIdx = str.indexOf('\x1b[200~');
      str = str.slice(startIdx + 6); // skip \x1b[200~
    }

    if (isPasting) {
      if (str.includes('\x1b[201~')) {
        const endIdx = str.indexOf('\x1b[201~');
        pasteBuffer += str.slice(0, endIdx);
        isPasting = false;

        // Paste finished. Check if it's multi-line or single-line
        const lines = pasteBuffer.split(/\r?\n/);
        if (lines.length > 1) {
          if (pastedText) {
            pastedText += '\n' + pasteBuffer;
          } else {
            pastedText = pasteBuffer;
          }
        } else {
          buf += pasteBuffer;
        }
        pasteBuffer = '';
        redraw();
      } else {
        pasteBuffer += str;
      }
      return; // prevent keypress/data handling
    }
  };

  const quit = () => {
    out.write('\x1b[?1000l\x1b[?1006l\x1b[?2004l'); // disable mouse and bracketed paste mode
    stdin.removeListener('keypress', onKey);
    stdin.removeListener('data', onData);
    if (stdin.isTTY) stdin.setRawMode(false);
    try { cb.onExit?.(); } catch { /* ignore */ }
    out.write('\n' + ansi.cyan('  🛸 AIOS offline. Connection terminated. Safe travels! 🌌\n\n'));
    process.exit(0);
  };

  stdin.on('keypress', onKey);
  stdin.prependListener('data', onData);

  /**
   * Open the browser-style multi-page modal. Resolves with the final
   * selection (item / input / cancel). While open, all keys are routed to
   * the modal (handled in onKey above, before the busy guard).
   */
  const openModal = (root: ModalPage, controller: ModalController): Promise<ModalOutcome> => {
    const modal = new Modal(out, controller, () => { activeModal = null; });
    activeModal = modal;
    redraw(); // clean the screen before the popup overlays it
    return modal.open(root).then((o) => {
      activeModal = null;
      redraw();
      return o;
    });
  };

  // Initial paint.
  recompute();
  redraw();

  return { close: quit, openModal, setStatus: (s: ReplStatus) => { status = s; redraw(); }, writer };
}

/**
 * Prompt for a secret (API key) on a TTY, masking input with `*`.
 * Temporarily releases the REPL's raw mode, reads one line, restores it.
 * Resolves with the trimmed input, or '' if the user entered nothing / it's
 * not a TTY.
 */
export function promptSecret(promptText: string): Promise<string> {
  secretPromptActive = true;
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const out = process.stdout;
    const wasRaw = !!(stdin.isTTY && (stdin as any).isRawMode?.());
    if (stdin.isTTY) stdin.setRawMode(false);
    out.write('\x1b[?1000l\x1b[?1006l'); // suspend mouse reporting temporarily
    out.write('\n' + promptText + ' ');

    let value = '';
    const onData = (chunk: Buffer) => {
      const str = chunk.toString();
      for (const ch of str) {
        if (ch === '\r' || ch === '\n') {
          cleanup();
          out.write('\n');
          resolve(value.trim());
          return;
        }
if (ch === '\u0003' || ch === '\u0004' || ch === '\u001b') {
           // Ctrl+C / Ctrl+D / Escape → cancel.
           cleanup();
           out.write('\n');
           resolve('');
           return;
         }
        if (ch === '\u007f' || ch === '\b') {
          if (value.length) {
            value = value.slice(0, -1);
            out.write('\b \b');
          }
        } else if (ch >= ' ') {
          value += ch;
          out.write('*');
        }
      }
    };
    const cleanup = () => {
      stdin.removeListener('data', onData);
      secretPromptActive = false;
      if (stdin.isTTY) stdin.setRawMode(wasRaw);
      if (wasRaw) out.write('\x1b[?1000h\x1b[?1006h'); // restore mouse reporting
    };
    stdin.on('data', onData);
  });
}

/** Set while promptSecret() is reading a hidden line, so the REPL's keypress
 *  handler ignores keystrokes intended for the secret prompt. */
let secretPromptActive = false;

/* ---- Help ---------------------------------------------------------- */

export function printHelp(): void {
  const w = Math.min((process.stdout.columns || 80) - 2, 90);
  const rule = ansi.dim('─'.repeat(w));
  const h  = (s: string) => `\n${ansi.bold(ansi.cyan(s))}\n`;
  const kv = (k: string, v: string) =>
    `  ${ansi.cyan(k.padEnd(22))} ${ansi.gray(v)}`;
  const ex = (cmd: string, note: string) =>
    `  ${ansi.model('$')} ${ansi.bold(cmd)}\n    ${ansi.dim(note)}`;

  process.stdout.write(
    [
      '',
      rule,
      h('  USAGE'),
      kv('aios [prompt]',        'one-shot mode — run a task and exit'),
      kv('aios',                 'interactive REPL mode (full session)'),
      '',
      rule,
      h('  OPTIONS'),
      kv('-m, --model <id>',     'model to use'),
      kv('-p, --provider <id>',  'provider  (anthropic | openai | openrouter | ollama | …)'),
      kv('-r, --root <path>',    'workspace root  (default: cwd)'),
      kv('-y, --yes',            'auto-approve file writes & commands'),
      kv('-i, --interactive',    'prompt before each mutating tool'),
      kv('-t, --temperature <n>','sampling temperature 0–1  (default 0.4)'),
      kv('--max-tokens <n>',     'max output tokens  (default: provider-aware)'),
      kv('-v, --version',        'print version'),
      kv('-h, --help',           'show this help'),
      '',
      rule,
      h('  REPL HOTKEYS'),
      kv('Enter',                'send message'),
      kv('↑ / ↓',                'recall history  |  move picker selection'),
      kv('/',                    'open slash menu  (↑↓ navigate · Enter/Tab accept · Esc close)'),
      kv('Ctrl+C / Ctrl+D',      'quit'),
      '',
      rule,
      h('  SLASH COMMANDS'),
      ...SLASH_COMMANDS.map((c) =>
        kv(c.name.padEnd(14), c.description),
      ),
      '',
      rule,
      h('  EXAMPLES'),
      ex('aios "fix the failing test in src/utils.ts"',
         'one-shot: diagnose and patch the test'),
      '',
      ex('aios "add dark theme" --model gpt-4o --yes',
         'auto-approve all writes, specific model'),
      '',
      ex('aios --provider ollama --model llama3 "explain this repo"',
         'fully local, no API key needed'),
      '',
      ex('aios   (then type: /provider)',
         'open the interactive provider picker'),
      '',
      rule,
      h('  CREDENTIALS'),
      kv('ANTHROPIC_API_KEY',    'Anthropic'),
      kv('OPENAI_API_KEY',       'OpenAI'),
      kv('OPENROUTER_API_KEY',   'OpenRouter'),
      kv('AIOS_API_KEY_<ID>',    'any other provider  (e.g. AIOS_API_KEY_GROQ)'),
      kv('AIOS_BASE_URL_<ID>',   'custom base URL  (e.g. AIOS_BASE_URL_MYPROVIDER)'),
      `  ${ansi.dim('config file:')} ${ansi.gray('~/.aios/config.json')}  ${ansi.dim('{ "providers": [ ... ] }')}`,
      '',
      `  ${ansi.dim('docs:')} ${ansi.gray('https://aiosapp.vercel.app')}`,
      '',
      rule,
      '',
    ].join('\n') + '\n',
  );
}
