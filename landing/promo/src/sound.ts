// Synthesizes short UI click sounds with the Web Audio API.
// No audio assets required — keeps the landing bundle tiny.

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  return ctx
}

/** A short, crisp UI click. `variant` changes the timbre slightly. */
export function playClick(variant: 'soft' | 'tick' | 'confirm' = 'soft'): void {
  const ac = getCtx()
  if (!ac) return
  if (ac.state === 'suspended') ac.resume().catch(() => {})

  const now = ac.currentTime
  const osc = ac.createOscillator()
  const gain = ac.createGain()

  const cfg = {
    soft: { freq: 880, type: 'triangle' as OscillatorType, dur: 0.05, vol: 0.06 },
    tick: { freq: 1320, type: 'square' as OscillatorType, dur: 0.03, vol: 0.04 },
    confirm: { freq: 660, type: 'sine' as OscillatorType, dur: 0.09, vol: 0.08 },
  }[variant]

  osc.type = cfg.type
  osc.frequency.setValueAtTime(cfg.freq, now)
  osc.frequency.exponentialRampToValueAtTime(cfg.freq * 0.6, now + cfg.dur)

  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(cfg.vol, now + 0.004)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + cfg.dur)

  osc.connect(gain).connect(ac.destination)
  osc.start(now)
  osc.stop(now + cfg.dur + 0.02)
}
