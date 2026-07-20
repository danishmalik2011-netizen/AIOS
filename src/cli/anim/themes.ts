/* ================================================
   AIOS CLI — animation themes (process verbs)
   Each "verb" is a themed state the agent moves through
   while working. It carries a glyph set (for the spinner
   frames) + a set of copy lines so the terminal reads
   like a living workshop rather than a progress bar.

   Verbs:
     brewing    — planning / reasoning / "cooking up" a plan
     weaving    — generating UI / composing output
     forging    — writing files / building artifacts
     scrupuling — verifying / linting / scrubbing edge cases
     divining   — searching / reading / discovering the right API
     channeling — streaming the model's response token-by-token
     building   — executing the plan / constructing the solution
     beating    — the idle/standby heartbeat (coral gem-mark pulse)
   ================================================ */

export type AnimVerb =
  | 'brewing'
  | 'weaving'
  | 'forging'
  | 'scrupuling'
  | 'divining'
  | 'channeling'
  | 'building'
  | 'beating';

/* ---- Heartbeat spinner (gem-mark pulse) ------------------------------ *
 * Distilled from the octagon/diamond gem mark. One character wide, beats
 * like a heart: lub (bright coral peak), dip, dub (softer white-flash
 * peak — the mark's inner facet), rest. Kept as standalone frames so it
 * can also drive ora or any other spinner consumer.
 * --------------------------------------------------------------------- */

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CORAL = '\x1b[38;5;203m'; // bright coral, matches the mark's ring
const CORAL_DEEP = '\x1b[38;5;166m'; // ember coral, the resting tone
const FLASH = '\x1b[97m'; // white — the mark's inner facet

// One heartbeat cycle: lub (hard peak) — dip — dub (soft peak) — rest.
const HEARTBEAT_BEATS = [
  { g: '◇', c: DIM + CORAL_DEEP }, // resting
  { g: '◈', c: CORAL }, // rising
  { g: '◆', c: BOLD + CORAL }, // LUB — peak
  { g: '◈', c: CORAL }, // falling
  { g: '◇', c: DIM + CORAL_DEEP }, // rest
  { g: '◈', c: CORAL_DEEP }, // rising, softer
  { g: '✦', c: BOLD + FLASH }, // dub — secondary peak, facet flash
  { g: '◇', c: DIM + CORAL_DEEP }, // rest
  { g: '◇', c: DIM + CORAL_DEEP }, // silence between beats
];

/** Heartbeat frames (coral-toned gem mark), ready for a FrameSpinner or ora. */
export const HEARTBEAT_FRAMES: string[] = HEARTBEAT_BEATS.map((f) => `${f.c}${f.g}${RESET}`);
/** ms/frame for the heartbeat — ~1 full beat per 810ms. */
export const HEARTBEAT_INTERVAL = 90;

/**
 * The AIOS brand glyph — a hexagon (⬢), mirroring the hexagonal "A" mark in
 * logo.svg / favicon.svg. Used as the body of every verb's spinner so the
 * agent always shows the AIOS mark in motion, with per-verb coloured wings.
 */
export const AIOS_GLYPH = '⬢';
/** Outline variant of the mark, used to make the non-winged frames pulse. */
export const AIOS_GLYPH_OUTLINE = '⬡';

export interface VerbTheme {
  /** Short label shown in the spinner prefix, e.g. "brewing". */
  label: string;
  /** Glyph frames cycled by the spinner for this verb (non-winged fallback). */
  frames: string[];
  /** Centre glyph for the winged spinner (the "body" of the icon). */
  centre: string;
  /** Wing glyph for the winged spinner (the flapping sides). */
  wing: string;
  /** ANSI colour name (resolved against the ui `ansi` palette). */
  color: 'you' | 'model' | 'provider' | 'cyan' | 'green' | 'yellow' | 'magenta' | 'blue';
  /** Copy templates; {x} is filled at call site. */
  copy: {
    start: string;
    tick: (detail?: string) => string;
    done: string;
  };
}

export const VERB_THEMES: Record<AnimVerb, VerbTheme> = {
  brewing: {
    label: 'brewing',
    frames: [AIOS_GLYPH_OUTLINE, AIOS_GLYPH, AIOS_GLYPH_OUTLINE, AIOS_GLYPH],
    centre: AIOS_GLYPH,
    wing: '✶',
    color: 'you',
    copy: {
      start: 'brewing the plan…',
      tick: (d) => (d ? `brewing… ${d}` : 'brewing the plan…'),
      done: 'plan brewed',
    },
  },
  divining: {
    label: 'divining',
    frames: [AIOS_GLYPH_OUTLINE, AIOS_GLYPH, AIOS_GLYPH_OUTLINE, AIOS_GLYPH],
    centre: AIOS_GLYPH,
    wing: '❖',
    color: 'provider',
    copy: {
      start: 'divining the right approach…',
      tick: (d) => (d ? `divining… ${d}` : 'divining the right approach…'),
      done: 'divined',
    },
  },
  forging: {
    label: 'forging',
    frames: [AIOS_GLYPH_OUTLINE, AIOS_GLYPH, AIOS_GLYPH_OUTLINE, AIOS_GLYPH],
    centre: AIOS_GLYPH,
    wing: '✧',
    color: 'yellow',
    copy: {
      start: 'forging artifacts…',
      tick: (d) => (d ? `forging… ${d}` : 'forging artifacts…'),
      done: 'forged',
    },
  },
  weaving: {
    label: 'weaving',
    frames: [AIOS_GLYPH_OUTLINE, AIOS_GLYPH, AIOS_GLYPH_OUTLINE, AIOS_GLYPH],
    centre: AIOS_GLYPH,
    wing: '✶',
    color: 'magenta',
    copy: {
      start: 'weaving the output…',
      tick: (d) => (d ? `weaving… ${d}` : 'weaving the output…'),
      done: 'woven',
    },
  },
  scrupuling: {
    label: 'scrupuling',
    frames: [AIOS_GLYPH_OUTLINE, AIOS_GLYPH, AIOS_GLYPH_OUTLINE, AIOS_GLYPH],
    centre: AIOS_GLYPH,
    wing: '✺',
    color: 'green',
    copy: {
      start: 'scrupuling the details…',
      tick: (d) => (d ? `scrupuling… ${d}` : 'scrupuling the details…'),
      done: 'scrupuled',
    },
  },
  channeling: {
    label: 'channeling',
    frames: [AIOS_GLYPH_OUTLINE, AIOS_GLYPH, AIOS_GLYPH_OUTLINE, AIOS_GLYPH],
    centre: AIOS_GLYPH,
    wing: '✶',
    color: 'model',
    copy: {
      start: 'channeling the model…',
      tick: (d) => (d ? `channeling… ${d}` : 'channeling the model…'),
      done: 'channeled',
    },
  },
  building: {
    label: 'building',
    frames: [AIOS_GLYPH_OUTLINE, AIOS_GLYPH, AIOS_GLYPH_OUTLINE, AIOS_GLYPH],
    centre: AIOS_GLYPH,
    wing: '▱',
    color: 'cyan',
    copy: {
      start: 'building the solution…',
      tick: (d) => (d ? `building… ${d}` : 'building the solution…'),
      done: 'built',
    },
  },
  beating: {
    label: 'beating',
    // The coral gem-mark heartbeat — lub (◆ peak), dip, dub (✦ facet flash), rest.
    frames: HEARTBEAT_FRAMES,
    centre: '◆',
    wing: '✦',
    color: 'model',
    copy: {
      start: 'AIOS is awake…',
      tick: (d) => (d ? `beating… ${d}` : 'AIOS is awake…'),
      done: 'still here',
    },
  },
};

/** Map a tool name to the verb it visually represents. */
export function verbForTool(tool: string): AnimVerb {
  switch (tool) {
    case 'read_file':
    case 'search_code':
    case 'list_dir':
    case 'pwd':
      return 'divining';
    case 'write_file':
    case 'patch_file':
    case 'append_file':
    case 'run_command':
      return 'forging';
    case 'git_commit':
    case 'git_status':
      return 'scrupuling';
    case 'wait':
      return 'brewing';
    case 'change_dir':
    default:
      return 'weaving';
  }
}
