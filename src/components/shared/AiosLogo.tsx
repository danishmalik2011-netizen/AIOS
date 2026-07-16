import { type SVGProps } from 'react';

interface AiosLogoProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

export function AiosLogo({ size = 32, ...props }: AiosLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 200"
      width={size}
      height={size}
      {...props}
    >
      <defs>
        <style>{`
          @keyframes logo-rotate-2d {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          .logo-ring-2d {
            transform-origin: 100px 100px;
            animation: logo-rotate-2d 25s linear infinite;
          }
        `}</style>
      </defs>

      {/* Static Center Core */}
      <circle
        cx="100"
        cy="100"
        r="34"
        fill="var(--bg-primary, #0b0f19)"
      />
      <circle
        cx="100"
        cy="100"
        r="28"
        fill="none"
        stroke="var(--logo-color, currentColor)"
        strokeWidth="3.5"
      />
      <circle
        cx="100"
        cy="100"
        r="34"
        fill="none"
        stroke="var(--logo-color, currentColor)"
        strokeWidth="2.2"
      />
      <text
        x="100"
        y="106"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontWeight="900"
        fontSize="17.5"
        fill="var(--logo-color, currentColor)"
        textAnchor="middle"
        letterSpacing="0.02em"
      >
        AIOS
      </text>

      {/* Rotating Outer Tech Ring & Spokes */}
      <g className="logo-ring-2d" stroke="var(--logo-color, currentColor)">
        {/* Outer double rings */}
        <circle
          cx="100"
          cy="100"
          r="62"
          fill="none"
          strokeWidth="2.2"
          opacity="0.8"
        />
        <circle
          cx="100"
          cy="100"
          r="68"
          fill="none"
          strokeWidth="1.5"
          opacity="0.5"
        />

        {/* 8 Radial Spokes */}
        <line x1="134" y1="100" x2="162" y2="100" strokeWidth="2.2" />
        <line x1="124.04" y1="124.04" x2="143.84" y2="143.84" strokeWidth="2.2" />
        <line x1="100" y1="134" x2="100" y2="162" strokeWidth="2.2" />
        <line x1="75.96" y1="124.04" x2="56.16" y2="143.84" strokeWidth="2.2" />
        <line x1="66" y1="100" x2="38" y2="100" strokeWidth="2.2" />
        <line x1="75.96" y1="75.96" x2="56.16" y2="56.16" strokeWidth="2.2" />
        <line x1="100" y1="66" x2="100" y2="38" strokeWidth="2.2" />
        <line x1="124.04" y1="75.96" x2="143.84" y2="56.16" strokeWidth="2.2" />

        {/* 8 Outer Nodes (Circle + Dot) */}
        <g transform="translate(165, 100)">
          <circle cx="0" cy="0" r="8" fill="var(--bg-primary, #0b0f19)" strokeWidth="2.2" />
          <circle cx="0" cy="0" r="4.2" fill="var(--logo-color, currentColor)" />
        </g>
        <g transform="translate(145.96, 145.96)">
          <circle cx="0" cy="0" r="8" fill="var(--bg-primary, #0b0f19)" strokeWidth="2.2" />
          <circle cx="0" cy="0" r="4.2" fill="var(--logo-color, currentColor)" />
        </g>
        <g transform="translate(100, 165)">
          <circle cx="0" cy="0" r="8" fill="var(--bg-primary, #0b0f19)" strokeWidth="2.2" />
          <circle cx="0" cy="0" r="4.2" fill="var(--logo-color, currentColor)" />
        </g>
        <g transform="translate(54.04, 145.96)">
          <circle cx="0" cy="0" r="8" fill="var(--bg-primary, #0b0f19)" strokeWidth="2.2" />
          <circle cx="0" cy="0" r="4.2" fill="var(--logo-color, currentColor)" />
        </g>
        <g transform="translate(35, 100)">
          <circle cx="0" cy="0" r="8" fill="var(--bg-primary, #0b0f19)" strokeWidth="2.2" />
          <circle cx="0" cy="0" r="4.2" fill="var(--logo-color, currentColor)" />
        </g>
        <g transform="translate(54.04, 54.04)">
          <circle cx="0" cy="0" r="8" fill="var(--bg-primary, #0b0f19)" strokeWidth="2.2" />
          <circle cx="0" cy="0" r="4.2" fill="var(--logo-color, currentColor)" />
        </g>
        <g transform="translate(100, 35)">
          <circle cx="0" cy="0" r="8" fill="var(--bg-primary, #0b0f19)" strokeWidth="2.2" />
          <circle cx="0" cy="0" r="4.2" fill="var(--logo-color, currentColor)" />
        </g>
        <g transform="translate(145.96, 54.04)">
          <circle cx="0" cy="0" r="8" fill="var(--bg-primary, #0b0f19)" strokeWidth="2.2" />
          <circle cx="0" cy="0" r="4.2" fill="var(--logo-color, currentColor)" />
        </g>
      </g>
    </svg>
  );
}
