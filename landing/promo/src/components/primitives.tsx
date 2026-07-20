import type React from 'react'
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { COLORS, FONTS } from '../theme'

/** A word/line that springs up from behind a clip mask — kinetic type */
export const RevealLine: React.FC<{
  children: React.ReactNode
  delay?: number
  style?: React.CSSProperties
}> = ({ children, delay = 0, style }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 26, stiffness: 130, mass: 0.9 },
  })
  const y = interpolate(progress, [0, 1], [110, 0])
  return (
    <div style={{ overflow: 'hidden', ...style }}>
      <div style={{ transform: `translateY(${y}%)` }}>{children}</div>
    </div>
  )
}

/** Fade + slight rise */
export const FadeUp: React.FC<{
  children: React.ReactNode
  delay?: number
  distance?: number
  style?: React.CSSProperties
}> = ({ children, delay = 0, distance = 40, style }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 30, stiffness: 110 },
  })
  return (
    <div
      style={{
        opacity: progress,
        transform: `translateY(${interpolate(progress, [0, 1], [distance, 0])}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/** Mono technical label, e.g. "BYOK NATIVE      [ 001 ]" */
export const MonoTag: React.FC<{
  left: string
  right?: string
  color?: string
  size?: number
}> = ({ left, right, color = COLORS.orange, size = 26 }) => (
  <div
    style={{
      display: 'flex',
      justifyContent: right ? 'space-between' : 'flex-start',
      fontFamily: FONTS.mono,
      fontSize: size,
      letterSpacing: '0.18em',
      color,
      fontWeight: 500,
      width: '100%',
    }}
  >
    <span>{left}</span>
    {right ? <span>{right}</span> : null}
  </div>
)

/** Scrolling marquee ticker strip like the site's hero */
export const Ticker: React.FC<{
  items: string[]
  speed?: number
  dark?: boolean
  fontSize?: number
}> = ({ items, speed = 3, dark = false, fontSize = 26 }) => {
  const frame = useCurrentFrame()
  const text = items.map((i) => `${i}   •   `).join('')
  const shift = (frame * speed) % 2400
  return (
    <div
      style={{
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        borderTop: `2px solid ${dark ? COLORS.darkLine : COLORS.ink}`,
        borderBottom: `2px solid ${dark ? COLORS.darkLine : COLORS.ink}`,
        padding: '18px 0',
        fontFamily: FONTS.mono,
        fontSize,
        letterSpacing: '0.2em',
        fontWeight: 500,
        color: dark ? COLORS.fadedText : COLORS.ink,
        background: dark ? COLORS.darkBg : 'transparent',
      }}
    >
      <div style={{ display: 'inline-block', transform: `translateX(${-shift}px)` }}>
        <span>{text}</span>
        <span>{text}</span>
        <span>{text}</span>
      </div>
    </div>
  )
}

/** Blinking terminal cursor */
export const Cursor: React.FC<{ color?: string; height?: number }> = ({
  color = COLORS.orange,
  height = 34,
}) => {
  const frame = useCurrentFrame()
  const visible = Math.floor(frame / 15) % 2 === 0
  return (
    <span
      style={{
        display: 'inline-block',
        width: height * 0.55,
        height,
        background: color,
        opacity: visible ? 1 : 0,
        verticalAlign: 'text-bottom',
        marginLeft: 6,
      }}
    />
  )
}

/** Types out text character-by-character starting at `delay` */
export const TypeText: React.FC<{
  text: string
  delay?: number
  charsPerFrame?: number
  style?: React.CSSProperties
  showCursor?: boolean
  cursorHeight?: number
}> = ({ text, delay = 0, charsPerFrame = 0.8, style, showCursor = false, cursorHeight = 34 }) => {
  const frame = useCurrentFrame()
  const chars = Math.max(0, Math.floor((frame - delay) * charsPerFrame))
  const visibleText = text.slice(0, chars)
  const done = chars >= text.length
  return (
    <span style={style}>
      {visibleText}
      {showCursor && (frame >= delay || done) ? <Cursor height={cursorHeight} /> : null}
    </span>
  )
}

/** The AIOS logo mark — orange rounded square with offset ink core */
export const LogoMark: React.FC<{ size?: number }> = ({ size = 120 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden="true">
    <rect x={6} y={6} width={88} height={88} rx={22} stroke={COLORS.orange} strokeWidth={12} />
    <path
      d="M32 40c0-6.6 5.4-12 12-12h16c6.6 0 12 5.4 12 12v14c0 6.6-5.4 12-12 12H38c-6.6 0-12-5.4-12-12V46c0-3.3 2.7-6 6-6Z"
      fill={COLORS.ink}
    />
  </svg>
)

/** The real AIOS app logo (matches the site's landing/assets/logo.png). */
export const RealLogo: React.FC<{ size?: number; style?: React.CSSProperties }> = ({
  size = 160,
  style,
}) => (
  <img
    src="/assets/logo.png"
    alt="AIOS"
    width={size}
    height={size}
    style={{ objectFit: 'contain', display: 'block', ...style }}
    crossOrigin="anonymous"
  />
)

/** Faint blueprint grid backdrop */
export const BlueprintGrid: React.FC<{ dark?: boolean }> = ({ dark = false }) => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      backgroundImage: `
        linear-gradient(${dark ? 'rgba(255,255,255,0.04)' : 'rgba(26,22,15,0.05)'} 1px, transparent 1px),
        linear-gradient(90deg, ${dark ? 'rgba(255,255,255,0.04)' : 'rgba(26,22,15,0.05)'} 1px, transparent 1px)
      `,
      backgroundSize: '90px 90px',
    }}
  />
)

/** Full-bleed scene wrapper */
export const Scene: React.FC<{
  children: React.ReactNode
  background?: string
  style?: React.CSSProperties
}> = ({ children, background = COLORS.cream, style }) => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      background,
      overflow: 'hidden',
      fontFamily: FONTS.sans,
      ...style,
    }}
  >
    {children}
  </div>
)
