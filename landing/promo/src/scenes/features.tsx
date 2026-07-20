import type React from 'react'
import { AbsoluteFill, interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { BlueprintGrid, FadeUp, MonoTag, RevealLine, Scene } from '../components/primitives'
import { COLORS, FONTS } from '../theme'

type Feature = {
  tag: string
  index: string
  title: string[]
  accentLine: number
  description: string
  stat: { label: string; value: string }
}

const FEATURES: Feature[] = [
  {
    tag: 'BYOK NATIVE',
    index: '[ 001 ]',
    title: ['Bring your', 'own keys.'],
    accentLine: 1,
    description: 'Plug in any provider. Your credentials live in ~/.aios/config.json — never on someone else’s server.',
    stat: { label: 'KEYS STORED REMOTELY', value: '0' },
  },
  {
    tag: 'ZERO TELEMETRY',
    index: '[ 002 ]',
    title: ['Nothing', 'phones home.'],
    accentLine: 0,
    description: 'No analytics. No tracking. No silent uploads. The network tab stays empty unless you say otherwise.',
    stat: { label: 'BYTES OF TELEMETRY SENT', value: '0' },
  },
  {
    tag: 'AGENT FLEET',
    index: '[ 003 ]',
    title: ['Specialist agents', 'do the work.'],
    accentLine: 0,
    description: 'A planner breaks your goal into steps. Specialist agents write code, review changes, and run tests locally.',
    stat: { label: 'RUNS ON', value: 'YOUR HARDWARE' },
  },
]

const FeatureCard: React.FC<{ feature: Feature; alt: boolean }> = ({ feature, alt }) => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()

  const panelIn = spring({ frame, fps, config: { damping: 26, stiffness: 110 } })
  const exitOpacity = interpolate(frame, [durationInFrames - 10, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
  })

  const barPct = interpolate(frame, [40, 75], [0, 100], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const bg = alt ? COLORS.creamDark : COLORS.cream

  return (
    <AbsoluteFill style={{ background: bg, opacity: exitOpacity }}>
      <BlueprintGrid />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 80,
          padding: '0 120px',
          transform: `translateY(${interpolate(panelIn, [0, 1], [50, 0])}px)`,
        }}
      >
        {/* Left: text */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 36 }}>
          <FadeUp delay={2}>
            <MonoTag left={feature.tag} right={feature.index} size={26} />
          </FadeUp>

          <div style={{ height: 3, background: COLORS.ink, width: `${panelIn * 120}px` }} />

          <div>
            {feature.title.map((line, i) => (
              <RevealLine key={line} delay={8 + i * 7}>
                <h2
                  style={{
                    fontFamily: FONTS.sans,
                    fontWeight: 900,
                    fontSize: 92,
                    lineHeight: 1.06,
                    letterSpacing: '-0.02em',
                    color: i === feature.accentLine ? COLORS.orange : COLORS.ink,
                    margin: 0,
                  }}
                >
                  {line}
                </h2>
              </RevealLine>
            ))}
          </div>

          <FadeUp delay={26}>
            <p
              style={{
                fontFamily: FONTS.sans,
                fontWeight: 500,
                fontSize: 32,
                lineHeight: 1.5,
                color: COLORS.inkSoft,
                margin: 0,
                maxWidth: 720,
              }}
            >
              {feature.description}
            </p>
          </FadeUp>
        </div>

        {/* Right: stat block */}
        <FadeUp delay={38}>
          <div
            style={{
              border: `3px solid ${COLORS.ink}`,
              padding: '40px 48px',
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
              background: COLORS.cream,
              minWidth: 420,
            }}
          >
            <div
              style={{
                fontFamily: FONTS.mono,
                fontSize: 22,
                letterSpacing: '0.18em',
                color: COLORS.inkSoft,
              }}
            >
              {feature.stat.label}
            </div>
            <div
              style={{
                fontFamily: FONTS.sans,
                fontWeight: 900,
                fontSize: 76,
                lineHeight: 1,
                color: COLORS.orange,
              }}
            >
              {feature.stat.value}
            </div>
            <div style={{ height: 10, background: COLORS.paperLine, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${barPct}%`, background: COLORS.orange }} />
            </div>
          </div>
        </FadeUp>
      </div>
    </AbsoluteFill>
  )
}

export const FeaturesScene: React.FC = () => {
  const per = 107
  return (
    <Scene>
      {FEATURES.map((feature, i) => (
        <Sequence key={feature.tag} from={i * per} durationInFrames={i === FEATURES.length - 1 ? 320 - per * 2 : per}>
          <FeatureCard feature={feature} alt={i % 2 === 1} />
        </Sequence>
      ))}
    </Scene>
  )
}
