/* ================================================
   AIOS CLI — animation engine (spinner primitives)
   Zero-dependency, TTY-aware frame spinner with:
     • a generic frame spinner (any glyph set)
     • a Claude-CLI-like "winged" spinner whose side
       wings flap outward/inward on alternating frames
   Non-blocking: drives itself via setInterval; the
   caller's event loop is never blocked.
   ================================================ */

import process from 'node:process';

/** True when we can render live frames (interactive TTY, colour on). */
export function canAnimate(): boolean {
  // AIOS_FORCE_ANIM lets the user opt in even when stdout isn't detected as a
  // TTY (e.g. some bundled-bin launch paths) or TERM reports "dumb".
  const forced = process.env.AIOS_FORCE_ANIM === '1' || process.env.AIOS_FORCE_ANIM === 'true';
  if (process.env.AIOS_NO_ANIM) return false;
  if (process.env.NO_COLOR != null) return false;
  if (forced) return true;
  return Boolean(process.stdout.isTTY && process.env.TERM !== 'dumb');
}

export interface FrameSpinnerOptions {
  /** Glyph frames cycled in order. */
  frames: string[];
  /** ms between frames. */
  interval?: number;
  /** Prefix painted before the frame (e.g. a coloured label). */
  prefix?: string;
  /** Suffix painted after the frame (e.g. the live status text). */
  suffix?: () => string;
  /** Stream to write to (defaults to stdout). */
  stream?: NodeJS.WriteStream;
}

/**
 * A self-driving frame spinner. Call `.start()`, update `.setSuffix()` as
 * state changes, and `.stop()` (optionally with a final frame) when done.
 * In non-TTY mode it degrades to a single static line written once.
 */
export class FrameSpinner {
  private frames: string[];
  private interval: number;
  private prefix: string;
  private suffixFn?: () => string;
  private stream: NodeJS.WriteStream;
  private timer: NodeJS.Timeout | null = null;
  private frame = 0;
  private running = false;
  private lastLine = '';

  constructor(opts: FrameSpinnerOptions) {
    this.frames = opts.frames.length ? opts.frames : ['·'];
    this.interval = opts.interval ?? 80;
    this.prefix = opts.prefix ?? '';
    this.suffixFn = opts.suffix;
    this.stream = opts.stream ?? (process.stdout as NodeJS.WriteStream);
  }

  setSuffix(fn: () => string): void {
    this.suffixFn = fn;
  }

  private render(): void {
    const glyph = this.frames[this.frame % this.frames.length];
    const suffix = this.suffixFn ? this.suffixFn() : '';
    const line = `${this.prefix}${glyph}${suffix}`;
    // Erase previous line (CR + spaces) then write the new one.
    this.stream.write(`\r${' '.repeat(this.lastLine.length)}\r${line}`);
    this.lastLine = line;
    this.frame++;
  }

  start(): void {
    if (this.running) return;
    if (!canAnimate()) {
      // Static fallback: print the prefix + first frame + suffix once.
      const glyph = this.frames[0];
      const suffix = this.suffixFn ? this.suffixFn() : '';
      this.stream.write(`${this.prefix}${glyph}${suffix}\n`);
      this.running = true;
      return;
    }
    this.running = true;
    this.render();
    // NOTE: intentionally NOT unref()-ing the timer. If we did, a short turn
    // where the event loop briefly idles could let the process exit before a
    // single frame painted — making the spinner look static / "all at once".
    // Keeping the timer referenced guarantees the animation actually cycles.
    this.timer = setInterval(() => this.render(), this.interval);
  }

  /** Stop and clear the line (or replace with a final frame). */
  stop(finalFrame?: string): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.running && canAnimate()) {
      const glyph = finalFrame ?? ' ';
      const suffix = this.suffixFn ? this.suffixFn() : '';
      const line = `${this.prefix}${glyph}${suffix}`;
      this.stream.write(`\r${' '.repeat(this.lastLine.length)}\r${line}\n`);
    }
    this.running = false;
    this.lastLine = '';
  }

  isRunning(): boolean {
    return this.running;
  }
}

/* ---- Winged spinner (Claude-CLI style flapping wings) -------------- *
 * A central glyph with two symmetric "wings" that flap outward and back
 * in. Frames are pre-computed so the motion is smooth and symmetric.
 * Example frames (centre ◈):
 *     ·  ✶  ·        ✶  ◈  ✶        ·  ✶  ·
 * The wings use ✶ ⟡ ❋ glyphs that read as feather/light strokes.
 * ------------------------------------------------------------------ */

const WING_GLYPHS = ['✶', '⟡', '❋', '✺'];

/** Build N symmetric winged frames around a centre glyph. */
export function buildWingedFrames(centre = '◈', count = 6, wing = '✶'): string[] {
  const n = Math.max(2, Math.floor(count / 2));
  const frames: string[] = [];
  // Outward sweep: wing distance grows 1..n then shrinks n..1
  const distances = [...Array.from({ length: n }, (_, i) => i + 1), ...Array.from({ length: n - 1 }, (_, i) => n - 1 - i)];
  for (const d of distances) {
    const w = d % 2 === 0 ? wing : WING_GLYPHS[(Math.floor(d / 2)) % WING_GLYPHS.length];
    const pad = ' '.repeat(d);
    frames.push(`${w}${pad}${centre}${pad}${w}`);
  }
  return frames;
}

/** Convenience: a ready-to-use winged spinner factory. */
export function createWingedSpinner(opts: Omit<FrameSpinnerOptions, 'frames'> & { centre?: string; wing?: string; wingCount?: number } = {}) {
  const { centre = '◈', wing, wingCount = 6, ...rest } = opts;
  return new FrameSpinner({
    ...rest,
    frames: buildWingedFrames(centre, wingCount, wing),
    interval: rest.interval ?? 90,
  });
}
