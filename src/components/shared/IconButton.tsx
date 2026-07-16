import { type ReactNode, type ButtonHTMLAttributes } from 'react';
import { Tooltip } from './Tooltip';
import './IconButton.css';

type IconButtonVariant = 'default' | 'ghost' | 'accent';
type IconButtonSize = 'sm' | 'md' | 'lg';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  tooltip?: string;
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  active?: boolean;
}

export function IconButton({
  icon,
  tooltip,
  tooltipSide = 'bottom',
  variant = 'default',
  size = 'md',
  active = false,
  className = '',
  ...rest
}: IconButtonProps) {
  const classes = [
    'aios-icon-button',
    `aios-icon-button--${variant}`,
    `aios-icon-button--${size}`,
    active ? 'aios-icon-button--active' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const btn = (
    <button className={classes} {...rest}>
      {icon}
    </button>
  );

  if (tooltip) {
    return (
      <Tooltip content={tooltip} side={tooltipSide} delay={300}>
        {btn}
      </Tooltip>
    );
  }

  return btn;
}
