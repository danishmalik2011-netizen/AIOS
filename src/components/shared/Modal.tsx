import { type ReactNode, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';
import './Modal.css';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: ModalSize;
  rawBody?: boolean;
}

const sizeClasses: Record<ModalSize, string> = {
  sm: 'aios-modal__panel--sm',
  md: 'aios-modal__panel--md',
  lg: 'aios-modal__panel--lg',
  xl: 'aios-modal__panel--xl',
};

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  rawBody = false,
}: ModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div className="aios-modal-overlay glass-overlay" onClick={onClose}>
      <div
        className={`aios-modal__panel glass-heavy ${sizeClasses[size]}`}
        onClick={(e) => e.stopPropagation()}
      >
        {rawBody ? (
          <>
            <div className="aios-modal__close-btn">
              <IconButton
                icon={<X size={16} />}
                onClick={onClose}
                tooltip="Close"
                variant="ghost"
                size="sm"
              />
            </div>
            {children}
          </>
        ) : (
          <>
            <header className="aios-modal__header">
              <h2 className="aios-modal__title">{title}</h2>
              <IconButton
                icon={<X size={16} />}
                onClick={onClose}
                tooltip="Close"
                variant="ghost"
                size="sm"
              />
            </header>
            <div className="aios-modal__body">{children}</div>
          </>
        )}
      </div>
    </div>
  );
}
