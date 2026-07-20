import { ipcMain, BrowserWindow } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import { CHANNELS } from './channels.js';

/* ================================================
   Text-to-speech, executed in the MAIN process.

   The renderer's Web Speech API (`window.speechSynthesis`) is unreliable in
   Electron: Chromium ships without the Google online voices on desktop builds,
   so `getVoices()` is frequently empty and `speak()` silently does nothing.
   That is why "Read Response Aloud" appeared broken out of the box.

   Fix: drive the OS-native speech engine from Node, which is always present:
     • Windows  -> System.Speech (SAPI) via PowerShell  (offline, no deps)
     • macOS    -> `say`                            (offline, no deps)
     • Linux    -> `espeak` / `espeak-ng` / `spd-say` (if installed)

   Speech is streamed to the default audio device. The renderer keeps a
   `speakingMessageId` and we notify it via the `tts:end` event when the
   engine finishes or errors, so the UI can reset cleanly.
   ================================================ */

export interface TtsSpeakParams {
  text: string;
  /** 0.1 – 10, mirrors SpeechSynthesisUtterance.rate (1 = normal). */
  rate?: number;
}

export interface TtsResult {
  ok: boolean;
  error?: string;
  /** Which backend actually handled the request. */
  engine?: 'sapi' | 'say' | 'espeak' | 'spd-say' | 'none';
}

let activeProcess: ChildProcess | null = null;

function notifyEnd(error?: string): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send(CHANNELS.ttsEnd, { error });
  });
}

function killActive(): void {
  if (activeProcess) {
    try {
      activeProcess.kill('SIGKILL');
    } catch {
      /* ignore */
    }
    activeProcess = null;
  }
}

/** Strip markdown / code fences so the voice reads clean prose. */
function cleanText(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, ' [code block] ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links -> label
    .replace(/[#>*_~|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Map a 0.1–10 rate to each engine's native scale. */
function rateToScale(rate: number, engine: TtsResult['engine']): number {
  const r = Math.min(10, Math.max(0.1, rate || 1));
  switch (engine) {
    case 'sapi': {
      // SAPI Rate is -10..10; ~1.0 -> 0, 1.25 -> ~2
      return Math.round((r - 1) * 8);
    }
    case 'say': {
      // `say -r` is words-per-minute (default 200)
      return Math.round(200 * r);
    }
    case 'espeak':
    case 'spd-say': {
      // espeak -s is words-per-minute (default 175)
      return Math.round(175 * r);
    }
    default:
      return r;
  }
}

function buildCommand(text: string, rate: number): { cmd: string; args: string[]; engine: TtsResult['engine'] } | null {
  const platform = process.platform;
  const safe = cleanText(text).slice(0, 4000); // cap to keep engines happy
  if (!safe) return null;

  if (platform === 'win32') {
    // PowerShell reads the text from stdin to avoid any quoting/escaping pitfalls.
    const r = rateToScale(rate, 'sapi');
    return {
      cmd: 'powershell',
      args: [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `$s=New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Rate=${r}; $s.Speak([console]::In.ReadToEnd())`,
      ],
      engine: 'sapi',
    };
  }

  if (platform === 'darwin') {
    const r = rateToScale(rate, 'say');
    return { cmd: 'say', args: ['-r', String(r), '-f', '-'], engine: 'say' };
  }

  // Linux: prefer espeak, fall back to spd-say
  const r = rateToScale(rate, 'espeak');
  return { cmd: 'espeak', args: ['-s', String(r), '-'], engine: 'espeak' };
}

export function registerTtsHandlers(): void {
  ipcMain.handle(CHANNELS.ttsSpeak, async (_event, params: TtsSpeakParams): Promise<TtsResult> => {
    killActive();
    const text = params?.text ?? '';
    const rate = params?.rate ?? 1;

    const spec = buildCommand(text, rate);
    if (!spec) {
      notifyEnd('Nothing to speak.');
      return { ok: false, error: 'Nothing to speak.', engine: 'none' };
    }

    // On Linux, espeak may be missing — try spd-say as a fallback.
    const trySpawn = (cmd: string, args: string[], engine: TtsResult['engine']): ChildProcess => {
      const child = spawn(cmd, args, { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] });
      child.stdin?.end(spec ? cleanText(text).slice(0, 4000) : '');
      return child;
    };

    try {
      let child = trySpawn(spec.cmd, spec.args, spec.engine);

      child.on('error', (err) => {
        // On Linux, if espeak is unavailable, retry with spd-say once.
        if (spec.engine === 'espeak' && (err as NodeJS.ErrnoException).code === 'ENOENT') {
          const fallback = spawn('spd-say', ['-r', String(Math.round(rate * 100))], {
            windowsHide: true,
            stdio: ['pipe', 'ignore', 'ignore'],
          });
          fallback.stdin?.end(cleanText(text).slice(0, 4000));
          fallback.on('error', () => notifyEnd('No speech engine available on this system.'));
          fallback.on('close', () => notifyEnd());
          activeProcess = fallback;
          return;
        }
        notifyEnd(err.message || 'Speech engine failed to start.');
      });

      child.on('close', () => {
        // Only notify if this is still the active process (not superseded).
        if (activeProcess === child) {
          activeProcess = null;
          notifyEnd();
        }
      });

      activeProcess = child;
      return { ok: true, engine: spec.engine };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start speech.';
      notifyEnd(msg);
      return { ok: false, error: msg, engine: spec.engine };
    }
  });

  ipcMain.handle(CHANNELS.ttsCancel, async (): Promise<TtsResult> => {
    killActive();
    return { ok: true };
  });
}
