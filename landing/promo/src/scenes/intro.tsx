import type React from 'react'
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { BlueprintGrid, FadeUp, RealLogo, MonoTag, Scene } from '../components/primitives'
import { COLORS, FONTS } from '../theme'

const BOOT_LINES = [
  '> aios --init',
  '> loading local runtime ......... OK',
  '> checking network calls ........ NONE',
  '> telemetry ..................... DISABLED',
]

export const IntroScene: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()

  const logoSpring = spring({
    frame: frame - 30,
    fps,
    config: { damping: 16, stiffness: 120, mass: 1 },
  })

  const exitOpacity = interpolate(frame, [durationInFrames - 14, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
  })

  return (
    <Scene>
      <BlueprintGrid />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 60,
          padding: '0 120px',
          opacity: exitOpacity,
        }}
      >
        {/* Left: boot lines + logo + wordmark */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 44,
            maxWidth: 760,
          }}
        >
          <div
            style={{
              fontFamily: FONTS.mono,
              fontSize: 24,
              color: COLORS.fadedText,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              minHeight: 130,
            }}
          >
            {BOOT_LINES.map((line, i) => {
              const appear = frame > i * 8 + 4
              return (
                <div key={line} style={{ opacity: appear ? 1 : 0 }}>
                  {line}
                </div>
              )
            })}
          </div>

          <div
            style={{
              transform: `scale(${logoSpring})`,
              display: 'flex',
              alignItems: 'center',
              gap: 32,
            }}
          >
            <RealLogo size={150} />
            <div
              style={{
                fontFamily: FONTS.sans,
                fontWeight: 900,
                fontSize: 120,
                letterSpacing: '0.06em',
                color: COLORS.ink,
                lineHeight: 1,
              }}
            >
              AIOS
            </div>
          </div>

          <FadeUp delay={48}>
            <div style={{ width: 560 }}>
              <MonoTag left="AI AGENT" right="OPERATING SYSTEM" size={24} />
            </div>
          </FadeUp>
        </div>

        {/* Right: big kinetic statement */}
        <FadeUp delay={20}>
          <div
            style={{
              fontFamily: FONTS.sans,
              fontWeight: 900,
              fontSize: 92,
              lineHeight: 1.08,
              letterSpacing: '-0.02em',
              color: COLORS.ink,
              textAlign: 'right',
              maxWidth: 620,
            }}
          >
            Your code.
            <br />
            <span style={{ color: COLORS.orange }}>Your machine.</span>
          </div>
        </FadeUp>
      </div>
    </Scene>
  )
}
