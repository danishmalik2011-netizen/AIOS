import type React from 'react'
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { BlueprintGrid, MonoTag, RevealLine, Scene, Ticker } from '../components/primitives'
import { COLORS, FONTS } from '../theme'

const TICKER_ITEMS = [
  'ZERO TELEMETRY',
  'BYOK ARCHITECTURE',
  'LOCAL FIRST',
  'YOUR HARDWARE, YOUR RULES',
  'FULL PRIVACY',
  'UNBOUNDED CONTEXT',
]

export const RevealScene: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()

  const wipe = spring({ frame, fps, config: { damping: 24, stiffness: 90 } })
  const wipeY = interpolate(wipe, [0, 1], [100, 0])

  const exitOpacity = interpolate(frame, [durationInFrames - 14, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
  })

  return (
    <Scene background={COLORS.darkBg}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: COLORS.orange,
          transform: `translateY(${wipeY * 1.15}%)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: COLORS.cream,
          transform: `translateY(${wipeY}%)`,
        }}
      >
        <BlueprintGrid />
      </div>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '0 120px',
          gap: 48,
          opacity: exitOpacity,
        }}
      >
        <div style={{ opacity: interpolate(frame, [14, 24], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
          <MonoTag left="THE ANSWER" right="[ 01 ]" size={26} />
        </div>

        <div>
          {['AIOS runs', 'entirely on', 'your machine.'].map((line, i) => (
            <RevealLine key={line} delay={16 + i * 8}>
              <h2
                style={{
                  fontFamily: FONTS.sans,
                  fontWeight: 900,
                  fontSize: 104,
                  lineHeight: 1.05,
                  color: i === 2 ? COLORS.orange : COLORS.ink,
                  margin: 0,
                  letterSpacing: '-0.02em',
                  textAlign: 'center',
                }}
              >
                {line}
              </h2>
            </RevealLine>
          ))}
        </div>

        <div style={{ opacity: interpolate(frame, [50, 64], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
          <p
            style={{
              fontFamily: FONTS.sans,
              fontWeight: 500,
              fontSize: 36,
              lineHeight: 1.5,
              color: COLORS.inkSoft,
              margin: 0,
              maxWidth: 900,
              textAlign: 'center',
            }}
          >
            A complete AI coding agent that executes on your hardware. No cloud. No sync. No leaks.
          </p>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: 56,
          left: 0,
          right: 0,
          opacity: interpolate(frame, [40, 56], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) * exitOpacity,
        }}
      >
        <Ticker items={TICKER_ITEMS} />
      </div>
    </Scene>
  )
}
