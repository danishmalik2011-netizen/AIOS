import type React from 'react'
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { FadeUp, MonoTag, RevealLine, Scene } from '../components/primitives'
import { COLORS, FONTS } from '../theme'

const TELEMETRY_LINES = [
  { text: '>> Telemetry: active', bad: true },
  { text: '>> IP Location: remote-west', bad: true },
  { text: '>> Encryption keys: managed-by-server', bad: true },
  { text: '>> Cloud repository status: sync-pending', bad: true },
  { text: '>> Uploading code repository & env config...', bad: true },
]

export const ProblemScene: React.FC = () => {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()

  const enterOpacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: 'clamp' })
  const exitOpacity = interpolate(frame, [durationInFrames - 14, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
  })

  const uploadPct = Math.min(97, Math.floor(interpolate(frame, [50, 165], [0, 97], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })))

  return (
    <Scene background={COLORS.darkBg} style={{ opacity: enterOpacity * exitOpacity }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 80,
          padding: '0 120px',
        }}
      >
        {/* Left: heading */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 48 }}>
          <FadeUp delay={4}>
            <MonoTag left="THE PROBLEM" right="[ 00 ]" color={COLORS.red} size={26} />
          </FadeUp>

          <div>
            {['Every AI coding', 'tool wants your', 'code in its cloud.'].map((line, i) => (
              <RevealLine key={line} delay={10 + i * 7}>
                <h2
                  style={{
                    fontFamily: FONTS.sans,
                    fontWeight: 800,
                    fontSize: 82,
                    lineHeight: 1.08,
                    color: i === 2 ? COLORS.red : '#EDE7DB',
                    margin: 0,
                    letterSpacing: '-0.01em',
                  }}
                >
                  {line}
                </h2>
              </RevealLine>
            ))}
          </div>

          <FadeUp delay={60}>
            <div
              style={{
                fontFamily: FONTS.mono,
                fontSize: 24,
                letterSpacing: '0.16em',
                color: COLORS.fadedText,
              }}
            >
              YOUR CODE. THEIR SERVERS. THEIR RULES.
            </div>
          </FadeUp>
        </div>

        {/* Right: fake terminal panel */}
        <FadeUp delay={40}>
          <div
            style={{
              width: 720,
              background: COLORS.darkPanel,
              border: `2px solid ${COLORS.darkLine}`,
              borderRadius: 14,
              padding: '36px 40px',
              fontFamily: FONTS.mono,
              fontSize: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
            }}
          >
            {TELEMETRY_LINES.map((line, i) => {
              const appear = frame > 48 + i * 14
              return (
                <div
                  key={line.text}
                  style={{
                    opacity: appear ? 1 : 0,
                    color: COLORS.fadedText,
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>{line.text}</span>
                  {appear ? <span style={{ color: COLORS.red, fontWeight: 700 }}>✕</span> : null}
                </div>
              )
            })}
            <div style={{ marginTop: 12 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  color: COLORS.red,
                  fontSize: 22,
                  marginBottom: 10,
                  letterSpacing: '0.1em',
                }}
              >
                <span>UPLOADING PRIVATE SOURCE</span>
                <span>{uploadPct}%</span>
              </div>
              <div style={{ height: 12, background: COLORS.darkLine, borderRadius: 6, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${uploadPct}%`, background: COLORS.red }} />
              </div>
            </div>
          </div>
        </FadeUp>
      </div>
    </Scene>
  )
}
