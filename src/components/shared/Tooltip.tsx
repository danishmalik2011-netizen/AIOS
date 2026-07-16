import { type ReactNode, useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import './Tooltip.css';

type TooltipSide = 'top' | 'right' | 'bottom' | 'left';

interface TooltipProps {
  content: string;
  side?: TooltipSide;
  delay?: number;
  children: ReactNode;
  disabled?: boolean;
}

export function Tooltip({
  content,
  side = 'top',
  delay = 400,
  children,
  disabled = false,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    
    let top = 0;
    let left = 0;
    
    switch (side) {
      case 'top':
        top = rect.top;
        left = rect.left + rect.width / 2;
        break;
      case 'bottom':
        top = rect.bottom;
        left = rect.left + rect.width / 2;
        break;
      case 'left':
        top = rect.top + rect.height / 2;
        left = rect.left;
        break;
      case 'right':
        top = rect.top + rect.height / 2;
        left = rect.right;
        break;
    }
    setCoords({ top, left });
  }, [side]);

  const show = useCallback(() => {
    if (disabled) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      updatePosition();
      setVisible(true);
    }, delay);
  }, [delay, disabled, updatePosition]);

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setVisible(false);
  }, []);

  useEffect(() => {
    if (visible) {
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);
      return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
      };
    }
  }, [visible, updatePosition]);

  return (
    <span
      className="aios-tooltip-trigger"
      ref={triggerRef}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {visible && !disabled && coords &&
        createPortal(
          <span
            className={`aios-tooltip aios-tooltip--portal aios-tooltip--${side} animate-fade-in`}
            role="tooltip"
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              pointerEvents: 'none',
              zIndex: 999999,
              transform: 
                side === 'top' ? 'translate(-50%, -100%) translateY(-8px)' :
                side === 'bottom' ? 'translate(-50%, 0) translateY(8px)' :
                side === 'left' ? 'translate(-100%, -50%) translateX(-8px)' :
                'translate(0, -50%) translateX(8px)'
            }}
          >
            {content}
            <span className="aios-tooltip__arrow" />
          </span>,
          document.body
        )
      }
    </span>
  );
}
