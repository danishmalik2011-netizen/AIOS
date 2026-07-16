import { type InputHTMLAttributes, type ReactNode, forwardRef } from 'react';
import './Input.css';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  icon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ icon, className = '', ...rest }, ref) => {
    return (
      <div className={`aios-input-wrapper ${className}`}>
        {icon && <span className="aios-input__icon">{icon}</span>}
        <input
          ref={ref}
          className={`aios-input glass-input ${icon ? 'aios-input--has-icon' : ''}`}
          {...rest}
        />
      </div>
    );
  }
);

Input.displayName = 'Input';
