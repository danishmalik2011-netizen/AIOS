import type { ReactNode } from 'react';
import './Badge.css';

type BadgeVariant = 'default' | 'accent' | 'success' | 'warning' | 'error';

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  dot?: boolean;
  className?: string;
}

const variantClassMap: Record<BadgeVariant, string> = {
  default: 'glass-badge',
  accent: 'glass-badge glass-badge-accent',
  success: 'glass-badge glass-badge-success',
  warning: 'glass-badge glass-badge-warning',
  error: 'glass-badge glass-badge-error',
};

export function Badge({
  variant = 'default',
  children,
  dot = false,
  className = '',
}: BadgeProps) {
  return (
    <span className={`aios-badge ${variantClassMap[variant]} ${className}`}>
      {dot && <span className={`aios-badge__dot aios-badge__dot--${variant}`} />}
      {children}
    </span>
  );
}
