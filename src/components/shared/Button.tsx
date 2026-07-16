import { type ReactNode, type ButtonHTMLAttributes } from 'react';
import './Button.css';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
  icon?: ReactNode;
  loading?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  children,
  icon,
  loading = false,
  disabled,
  className = '',
  ...rest
}: ButtonProps) {
  const classes = [
    'aios-button',
    `aios-button--${variant}`,
    `aios-button--${size}`,
    loading ? 'aios-button--loading' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button className={classes} disabled={disabled || loading} {...rest}>
      {loading && (
        <span className="aios-button__spinner" aria-hidden="true" />
      )}
      {!loading && icon && <span className="aios-button__icon">{icon}</span>}
      <span className="aios-button__label">{children}</span>
    </button>
  );
}
