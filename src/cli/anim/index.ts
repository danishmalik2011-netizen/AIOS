/* ================================================
   AIOS CLI — animation controller
   Public surface used by the turn UI and anywhere else
   the agent wants a themed, living status line.

   Usage:
     const anim = createAnim({ stream: process.stdout });
     anim.start('brewing');
     anim.setDetail('mapping the repo…');
     anim.transition('forging');   // switches verb + colour
     anim.stop('done');            // clears the line

   In non-TTY / CI mode it degrades to a single static
   "[brewing…]" line so logs stay clean.
   ================================================ */

import { FrameSpinner, createWingedSpinner, canAnimate } from './spinner';
import { VERB_THEMES, type AnimVerb } from './themes';

export { canAnimate, buildWingedFrames } from './spinner';
export { VERB_THEMES, verbForTool, AIOS_GLYPH, AIOS_GLYPH_OUTLINE, HEARTBEAT_FRAMES, HEARTBEAT_INTERVAL } from './themes';
export type { AnimVerb } from './themes';

export interface AnimOptions {
  /** Stream to write to (defaults to stdout). */
  stream?: NodeJS.WriteStream;
  /** Use the Claude-like winged spinner (default true). */
  winged?: boolean;
  /** Centre glyph for the winged spinner. */
  centre?: string;
}

export interface AnimController {
  start(verb: AnimVerb, detail?: string): void;
  setDetail(detail: string): void;
  /** Switch to a new verb (new glyph set + colour + copy). */
  transition(verb: AnimVerb, detail?: string): void;
  /** Stop and clear the line. `final` is an optional trailing glyph/word. */
  stop(final?: string): void;
  isRunning(): boolean;
  currentVerb(): AnimVerb | null;
}

export function createAnim(opts: AnimOptions = {}): AnimController {
  const stream = opts.stream ?? (process.stdout as NodeJS.WriteStream);
  const winged = opts.winged ?? true;

  let spinner: FrameSpinner | null = null;
  let verb: AnimVerb | null = null;
  let detail = '';

  // Colour resolver — kept local so this module has no hard dep on ui.ts.
  // Mirrors the 256-colour accents used across the CLI.
  const ESC = '\x1b[';
  const palette: Record<string, string> = {
    you: `${ESC}38;5;84m`,
    model: `${ESC}38;5;215m`,
    provider: `${ESC}38;5;147m`,
    cyan: `${ESC}36m`,
    green: `${ESC}32m`,
    yellow: `${ESC}33m`,
    magenta: `${ESC}35m`,
    blue: `${ESC}34m`,
  };
  const reset = `${ESC}0m`;
  const paint = (c: string, s: string) => (canAnimate() ? `${palette[c] ?? ''}${s}${reset}` : s);

  const prefixFor = (v: AnimVerb) => {
    const t = VERB_THEMES[v];
    return paint(t.color, `  ${t.label} `);
  };

  const suffixFor = () => {
    if (!verb) return '';
    const t = VERB_THEMES[verb];
    const base = detail ? t.copy.tick(detail) : t.copy.start;
    return paint('gray' in palette ? 'cyan' : 'cyan', ` ${base}`);
  };

  const buildSpinner = (v: AnimVerb): FrameSpinner => {
    const t = VERB_THEMES[v];
    if (winged) {
      const sp = createWingedSpinner({ centre: t.centre, wing: t.wing, stream, prefix: prefixFor(v), interval: 90 });
      sp.setSuffix(suffixFor);
      return sp;
    }
    const sp = new FrameSpinner({
      frames: t.frames,
      stream,
      prefix: prefixFor(v),
      interval: 80,
    });
    sp.setSuffix(suffixFor);
    return sp;
  };

  return {
    start(v: AnimVerb, d = '') {
      verb = v;
      detail = d;
      spinner = buildSpinner(v);
      spinner.start();
    },
    setDetail(d: string) {
      detail = d;
      if (spinner) spinner.setSuffix(suffixFor);
    },
    transition(v: AnimVerb, d = '') {
      const wasRunning = spinner?.isRunning() ?? false;
      if (spinner) spinner.stop();
      verb = v;
      detail = d;
      spinner = buildSpinner(v);
      if (wasRunning) spinner.start();
    },
    stop(final?: string) {
      if (spinner) {
        spinner.stop(final);
        spinner = null;
      }
      verb = null;
      detail = '';
    },
    isRunning() {
      return spinner?.isRunning() ?? false;
    },
    currentVerb() {
      return verb;
    },
  };
}
