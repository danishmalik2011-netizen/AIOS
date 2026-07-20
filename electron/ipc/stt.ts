import { ipcMain } from 'electron';
import { spawn } from 'node:child_process';
import { CHANNELS } from './channels.js';

/* ================================================
   Speech-to-text (offline, OS-native), run in the MAIN process.

   The composer's "Voice Input" button records audio with MediaRecorder and
   sends it to a cloud Whisper endpoint (Groq / OpenAI / Gemini). That works
   great when an API key is configured, but it must ALSO work with zero setup
   for users who have no key.

   This module provides a zero-config, offline fallback that uses the speech
   engine already present on the user's OS, so the mic always does something:
     • Windows  -> System.Speech (SAPI) dictation via PowerShell (offline)
     • macOS    -> not scriptable without extra deps; returns a clear message
     • Linux    -> not bundled; returns a clear message

   The handler performs a ONE-SHOT recognition: it opens the default mic,
   listens until a phrase completes (or a timeout elapses), and returns the
   recognized text. It is invoked either as the primary path (no API key) or
   as a last resort after the cloud providers have been tried.

   Robustness notes:
     - The whole operation is bounded by a hard kill timer so a hung PowerShell
       can never block the renderer forever.
     - The child process is force-killed (SIGKILL + taskkill fallback) and the
       SAPI engine is always disposed, so the mic is always released.
     - SAPI's default dictation grammar occasionally returns nothing on the
       first attempt (cold recognizer / no trained profile). We retry a couple
       of times and, if still empty, return a helpful, non-fatal message.
   ================================================ */

export interface SttResult {
  ok: boolean;
  /** Recognized transcript (may be empty if nothing was understood). */
  text?: string;
  error?: string;
  /** Which backend actually handled the request. */
  engine?: 'sapi' | 'none';
}

const RECOGNIZE_TIMEOUT_MS = 12000;
const MAX_ATTEMPTS = 3;

/**
 * Run a single one-shot SAPI recognition. Resolves with the recognized text
 * (possibly empty) or rejects on a hard failure. The caller owns retries.
 */
function recognizeOnce(timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const ps = `
Add-Type -AssemblyName System.Speech
$engine = $null
try {
  # Explicitly pick the default (installed) speech recognizer. Without this,
  # SAPI may fail on systems with no trained user profile.
  $recognizerInfo = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() |
    Where-Object { $_.Culture.Name -like 'en-*' } | Select-Object -First 1
  if (-not $recognizerInfo) {
    $recognizerInfo = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() | Select-Object -First 1
  }
  if (-not $recognizerInfo) { throw 'No speech recognizer installed on this system.' }
  $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine($recognizerInfo)
  $engine.SetInputToDefaultAudioDevice()
  $g = New-Object System.Speech.Recognition.DictationGrammar
  $engine.LoadGrammar($g)
  $signal = New-Object System.Threading.ManualResetEvent($false)
  $script:txt = $null
  Register-ObjectEvent -InputObject $engine -EventName SpeechRecognized -Action {
    $script:txt = $EventArgs.Result.Text
    $signal.Set()
  } | Out-Null
  Register-ObjectEvent -InputObject $engine -EventName RecognizeCompleted -Action {
    $signal.Set()
  } | Out-Null
  $engine.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Single)
  $done = $signal.WaitOne(${timeoutMs})
  $engine.RecognizeAsyncStop()
  if ($done -and $script:txt) { $script:txt } else { "" }
} catch {
  Write-Error $_.Exception.Message
  ""
} finally {
  if ($engine) { try { $engine.Dispose() } catch {} }
}
`.trim();

    const child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));

    let settled = false;
    const finish = (fn: (v: any) => void, v: any) => {
      if (settled) return;
      settled = true;
      fn(v);
    };

    // Hard safety timeout: never let a hung PowerShell block the caller.
    const killTimer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* ignore */
      }
      try {
        spawn('taskkill', ['/F', '/IM', 'powershell.exe'], { windowsHide: true });
      } catch {
        /* ignore */
      }
      finish(reject, new Error('Local recognition timed out.'));
    }, timeoutMs + 5000);

    child.on('error', (err) => {
      clearTimeout(killTimer);
      finish(reject, err);
    });

    child.on('close', () => {
      clearTimeout(killTimer);
      const text = (stdout || '').trim();
      if (text.length > 0) {
        finish(resolve, text);
      } else if (stderr && stderr.trim().length > 0) {
        finish(reject, new Error(stderr.trim().split('\n')[0]));
      } else {
        finish(resolve, ''); // empty = nothing recognized this attempt
      }
    });
  });
}

function transcribeWindows(): Promise<SttResult> {
  return new Promise((resolve) => {
    let attempt = 0;
    const tryOnce = () => {
      attempt += 1;
      recognizeOnce(RECOGNIZE_TIMEOUT_MS)
        .then((text) => {
          if (text && text.length > 0) {
            resolve({ ok: true, text, engine: 'sapi' });
          } else if (attempt < MAX_ATTEMPTS) {
            // Cold recognizer — give it another shot.
            tryOnce();
          } else {
            resolve({
              ok: false,
              text: '',
              engine: 'none',
              error: 'No speech was recognized. Please speak clearly into your microphone and try again.',
            });
          }
        })
        .catch((err: Error) => {
          if (attempt < MAX_ATTEMPTS) {
            tryOnce();
          } else {
            resolve({ ok: false, text: '', engine: 'none', error: err.message });
          }
        });
    };
    tryOnce();
  });
}

export function registerSttHandlers(): void {
  ipcMain.handle(CHANNELS.sttTranscribe, async (): Promise<SttResult> => {
    if (process.platform === 'win32') {
      return transcribeWindows();
    }
    // Non-Windows: no bundled offline engine. Return a clear, non-fatal result
    // so the renderer can tell the user to configure a cloud key.
    return {
      ok: false,
      text: '',
      engine: 'none',
      error:
        'Offline speech recognition is only available on Windows. Please configure a Groq, OpenAI, or Gemini API key in Settings for transcription on this platform.',
    };
  });
}
