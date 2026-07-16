import './Progress.css';

type ProgressVariant = 'default' | 'accent' | 'success';
type ProgressSize = 'sm' | 'md' | 'lg';

interface ProgressProps {
  value: number;
  variant?: ProgressVariant;
  size?: ProgressSize;
  animated?: boolean;
  className?: string;
}

export function Progress({
  value,
  variant = 'default',
  size = 'md',
  animated = false,
  className = '',
}: ProgressProps) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div
      className={`aios-progress aios-progress--${size} ${className}`}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`aios-progress__fill aios-progress__fill--${variant} ${animated ? 'aios-progress__fill--animated' : ''}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
