import type { CSSProperties } from 'react';

interface WordmarkProps {
  className?: string;
  aSize?: string;
  restClassName?: string;
  style?: CSSProperties;
}

export function Wordmark({ className, aSize = '0.82em', restClassName, style }: WordmarkProps) {
  return (
    <span className={className} style={style}>
      <svg
        className="wordmark__a"
        viewBox="40 40 120 120"
        style={{ width: aSize, height: aSize }}
        aria-hidden="true"
      >
        <path
          d="M66 146 L100 54 L134 146"
          fill="none"
          stroke="currentColor"
          strokeWidth="17"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className={`wordmark__rest ${restClassName ?? ''}`}>IOS</span>
    </span>
  );
}