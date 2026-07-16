import { Loader2 } from 'lucide-react';

type SpinnerSize = 'sm' | 'md' | 'lg';

interface SpinnerProps {
  size?: SpinnerSize;
  color?: string;
}

const sizeMap: Record<SpinnerSize, number> = {
  sm: 14,
  md: 20,
  lg: 28,
};

export function Spinner({ size = 'md', color }: SpinnerProps) {
  return (
    <Loader2
      size={sizeMap[size]}
      className="animate-spin"
      style={{ color: color ?? 'var(--accent-primary)' }}
    />
  );
}
