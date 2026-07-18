import { type SVGProps } from 'react';

interface AiosLogoProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

export function AiosLogo({ size = 32, ...props }: AiosLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 120 120"
      width={size}
      height={size}
      fill="currentColor"
      {...props}
    >
      <polygon points="35,10 110,10 110,85 85,110 10,110 10,35" fill="var(--accent-primary, #f03e3e)" />
      <polygon points="35,22 98,22 98,85 85,98 22,98 22,35" fill="var(--bg-primary, #0b0f19)" />
      <polygon points="45,35 85,35 85,75 75,85 35,85 35,45" fill="var(--text-primary, #ffffff)" />
    </svg>
  );
}
