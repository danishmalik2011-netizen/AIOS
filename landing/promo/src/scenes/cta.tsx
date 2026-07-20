import type React from 'react'
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { BlueprintGrid, FadeUp, RealLogo, Scene, Ticker, TypeText } from '../components/primitives'
import { COLORS, FONTS } from '../theme'

const TICKER_ITEMS = [
  'ZERO TELEMETRY',
  'BYOK ARCHITECTURE',
  'LOCAL FIRST',
  'FULL PRIVACY',
  'YOUR HARDWARE, YOUR RULES',
]

export const CtaScene: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const logoIn = spring({ frame: frame - 4, fps, config: { damping: 18, stiffness: 130 } })
  const btnIn = spring({ frame: frame - 78, fps, config: { damping: 16, stiffness: 140 } })
  const pulse = 1 + Math.sin(frame / 9) * 0.015

  return (
    <Scene>
      <BlueprintGrid />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 44,
          padding: '0 120px',
        }}
      >
        <div style={{ transform: `scale(${logoIn})` }}>
          <RealLogo size={120} />
        </div>

        <div style={{ textAlign: 'center' }}>
          <FadeUp delay={10}>
            <h2
              style={{
                fontFamily: FONTS.sans,
                fontWeight: 900,
                fontSize: 104,
                lineHeight: 1.08,
                letterSpacing: '-0.02em',
                color: COLORS.ink,
                margin: 0,
              }}
            >
              Own your
            </h2>
          </FadeUp>
          <FadeUp delay={17}>
            <h2
              style={{
                fontFamily: FONTS.sans,
                fontWeight: 900,
                fontSize: 104,
                lineHeight: 1.08,
                letterSpacing: '-0.02em',
                color: COLORS.orange,
                margin: 0,
              }}
            >
              AI stack.
            </h2>
          </FadeUp>
        </div>

        <FadeUp delay={30}>
          <div
            style={{
              border: `3px solid ${COLORS.ink}`,
              background: '#FFFFFF',
              padding: '28px 44px',
              fontFamily: FONTS.mono,
              fontSize: 34,
              color: COLORS.ink,
              minWidth: 620,
            }}
          >
            <span style={{ color: COLORS.orange }}>{'$ '}</span>
            <TypeText text="npm install -g aios" delay={40} charsPerFrame={0.7} showCursor cursorHeight={36} />
          </div>
        </FadeUp>

        <div
          style={{
            transform: `scale(${btnIn * pulse})`,
            opacity: btnIn,
            background: COLORS.orange,
            color: COLORS.cream,
            fontFamily: FONTS.mono,
            fontWeight: 700,
            fontSize: 34,
            letterSpacing: '0.16em',
            padding: '28px 72px',
            clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0 100%)',
          }}
        >
          JOIN THE WAITLIST
        </div>

        <div
          style={{
            fontFamily: FONTS.mono,
            fontSize: 26,
            letterSpacing: '0.2em',
            color: COLORS.inkSoft,
            opacity: interpolate(frame, [100, 116], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          }}
        >
          AIOSAPP.VERCEL.APP
        </div>
      </div>

      <div style={{ position: 'absolute', bottom: 56, left: 0, right: 0 }}>
        <Ticker items={TICKER_ITEMS} speed={4} />
      </div>
    </Scene>
  )
}
