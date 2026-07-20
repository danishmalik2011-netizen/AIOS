import type React from 'react'
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { FadeUp, MonoTag, Scene, TypeText } from '../components/primitives'
import { COLORS, FONTS } from '../theme'

const AGENT_STEPS = [
  { agent: 'PLANNER', action: 'Breaking goal into 4 steps', delay: 62 },
  { agent: 'CODER', action: 'Writing ContactForm.tsx', delay: 88 },
  { agent: 'REVIEWER', action: 'Reviewing diff — 2 suggestions applied', delay: 114 },
  { agent: 'TESTER', action: 'Running tests locally ... 12/12 passed', delay: 140 },
]

export const WorkflowScene: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()

  const enter = spring({ frame, fps, config: { damping: 26, stiffness: 100 } })
  const exitOpacity = interpolate(frame, [durationInFrames - 14, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
  })

  const committed = frame > 172

  return (
    <Scene background={COLORS.darkBg} style={{ opacity: exitOpacity }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '0 120px',
          gap: 40,
        }}
      >
        <FadeUp delay={2}>
          <MonoTag left="HOW IT WORKS" right="[ 02 ]" size={26} />
        </FadeUp>

        <FadeUp delay={6}>
          <h2
            style={{
              fontFamily: FONTS.sans,
              fontWeight: 800,
              fontSize: 76,
              lineHeight: 1.1,
              color: '#EDE7DB',
              margin: 0,
              letterSpacing: '-0.01em',
            }}
          >
            Describe it.{' '}
            <span style={{ color: COLORS.orangeBright }}>Agents build it.</span>
          </h2>
        </FadeUp>

        <div
          style={{
            background: COLORS.darkPanel,
            border: `2px solid ${COLORS.darkLine}`,
            borderRadius: 16,
            overflow: 'hidden',
            transform: `translateY(${interpolate(enter, [0, 1], [60, 0])}px)`,
            opacity: enter,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '18px 28px',
              borderBottom: `2px solid ${COLORS.darkLine}`,
              fontFamily: FONTS.mono,
              fontSize: 22,
              color: COLORS.fadedText,
              letterSpacing: '0.14em',
            }}
          >
            <span>AIOS — dev-mode</span>
            <span style={{ color: COLORS.green }}>● LOCAL</span>
          </div>

          <div style={{ padding: '32px 36px 40px', display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ fontFamily: FONTS.mono, fontSize: 28, color: '#EDE7DB', minHeight: 40 }}>
              <span style={{ color: COLORS.orangeBright }}>{'$ '}</span>
              <TypeText text='aios "add a contact form to my site"' delay={14} charsPerFrame={1.1} showCursor cursorHeight={30} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {AGENT_STEPS.map((step) => {
                const p = spring({ frame: frame - step.delay, fps, config: { damping: 28, stiffness: 130 } })
                const active = frame >= step.delay
                return (
                  <div
                    key={step.agent}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 20,
                      opacity: p,
                      transform: `translateX(${interpolate(p, [0, 1], [-40, 0])}px)`,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: FONTS.mono,
                        fontSize: 21,
                        fontWeight: 700,
                        letterSpacing: '0.12em',
                        color: COLORS.orangeBright,
                        border: `2px solid ${COLORS.orangeBright}`,
                        padding: '8px 16px',
                        minWidth: 170,
                        textAlign: 'center',
                      }}
                    >
                      {step.agent}
                    </div>
                    <div style={{ fontFamily: FONTS.mono, fontSize: 24, color: COLORS.fadedText, flex: 1 }}>
                      {step.action}
                    </div>
                    {active ? (
                      <span style={{ color: COLORS.green, fontFamily: FONTS.mono, fontSize: 26, fontWeight: 700 }}>✓</span>
                    ) : null}
                  </div>
                )
              })}
            </div>

            <div
              style={{
                fontFamily: FONTS.mono,
                fontSize: 24,
                color: committed ? COLORS.green : 'transparent',
                borderTop: `2px solid ${COLORS.darkLine}`,
                paddingTop: 24,
              }}
            >
              {'✓ committed to git — you review, you ship.'}
            </div>
          </div>
        </div>
      </div>
    </Scene>
  )
}
