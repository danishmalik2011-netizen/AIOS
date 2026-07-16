import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import './Dropdown.css';

export interface DropdownOption {
  value: string;
  /** Primary text for the option. */
  label: string;
  /** Optional secondary text shown muted beneath the label. */
  description?: string;
  /** Leading node — icon, avatar, or status dot. */
  leading?: ReactNode;
  /** Optional trailing node shown before the active check. */
  trailing?: ReactNode;
  disabled?: boolean;
}

interface DropdownProps {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  /** Placeholder shown when no option matches `value`. */
  placeholder?: string;
  /** Which side the menu opens toward. Composer sits at the bottom → 'top'. */
  menuPlacement?: 'top' | 'bottom';
  /** Horizontal edge the menu aligns to. */
  align?: 'start' | 'end';
  className?: string;
  /** Fixed menu width in px; defaults to matching the trigger. */
  menuWidth?: number;
  disabled?: boolean;
  /** When true, render a search box at the top of the menu to filter options. */
  searchable?: boolean;
  /** Placeholder for the search box (falls back to a sensible default). */
  searchPlaceholder?: string;
}

/**
 * Accessible popover select. Built for the chat composer but generic:
 * keyboard driven (↑/↓/Home/End/Enter/Esc), closes on outside click, and
 * renders rich option rows (leading icon/avatar, label + description).
 */
export function Dropdown({
  value,
  options,
  onChange,
  ariaLabel,
  placeholder,
  menuPlacement = 'bottom',
  align = 'start',
  className,
  menuWidth,
  disabled = false,
  searchable = false,
  searchPlaceholder,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value) ?? null;
  const selectedIndex = options.findIndex((o) => o.value === value);

  // Options after applying the search filter.
  const filtered = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.description?.toLowerCase().includes(q),
    );
  }, [options, searchable, query]);

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
    setQuery('');
  }, []);

  const openMenu = useCallback(() => {
    if (disabled) return;
    setQuery('');
    setActiveIndex(
      selected
        ? Math.max(0, filtered.findIndex((o) => o.value === selected.value))
        : 0,
    );
    setOpen(true);
    // Focus the search box after it renders.
    if (searchable) {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [disabled, selected, filtered, searchable]);

  const commit = useCallback(
    (index: number) => {
      const option = filtered[index];
      if (!option || option.disabled) return;
      onChange(option.value);
      close();
    },
    [filtered, onChange, close],
  );

  const moveActive = useCallback(
    (delta: number) => {
      setActiveIndex((prev) => {
        const count = filtered.length;
        if (count === 0) return -1;
        let next = prev;
        for (let step = 0; step < count; step++) {
          next = (next + delta + count) % count;
          if (!filtered[next]?.disabled) return next;
        }
        return prev;
      });
    },
    [filtered],
  );

  // Close on outside interaction.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    window.addEventListener('mousedown', onPointerDown, true);
    return () => window.removeEventListener('mousedown', onPointerDown, true);
  }, [open, close]);

  // Reset the active option whenever the search query changes.
  useEffect(() => {
    if (!open) return;
    setActiveIndex(filtered.findIndex((o) => !o.disabled));
  }, [open, query, filtered]);

  // Keep the active option scrolled into view.
  useLayoutEffect(() => {
    if (!open || activeIndex < 0) return;
    const node = menuRef.current?.querySelector<HTMLElement>(
      `[data-index="${activeIndex}"]`,
    );
    node?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  const handleTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        e.preventDefault();
        if (!open) openMenu();
        else moveActive(e.key === 'ArrowDown' ? 1 : -1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (!open) openMenu();
        else commit(activeIndex);
        break;
      case 'Home':
        if (open) {
          e.preventDefault();
          setActiveIndex(filtered.findIndex((o) => !o.disabled));
        }
        break;
      case 'End':
        if (open) {
          e.preventDefault();
          for (let i = filtered.length - 1; i >= 0; i--) {
            if (!filtered[i].disabled) {
              setActiveIndex(i);
              break;
            }
          }
        }
        break;
      case 'Escape':
        if (open) {
          e.preventDefault();
          close();
        }
        break;
      case 'Tab':
        if (open) close();
        break;
    }
  };

  return (
    <div
      ref={rootRef}
      className={`dropdown${open ? ' dropdown--open' : ''}${className ? ` ${className}` : ''}`}
    >
      <button
        type="button"
        className="dropdown__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={handleTriggerKey}
      >
        {selected?.leading && (
          <span className="dropdown__trigger-leading">{selected.leading}</span>
        )}
        <span className="dropdown__trigger-label">
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={13} className="dropdown__chevron" aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={menuRef}
          id={listId}
          className={`dropdown__menu glass dropdown__menu--${menuPlacement} dropdown__menu--${align}${
            searchable ? ' dropdown__menu--searchable' : ''
          }`}
          role="listbox"
          aria-label={ariaLabel}
          tabIndex={-1}
          style={menuWidth ? { width: menuWidth } : undefined}
        >
          {open && searchable && (
            <div className="dropdown__search">
              <Search size={12} className="dropdown__search-icon" aria-hidden="true" />
              <input
                ref={searchRef}
                type="text"
                className="dropdown__search-input"
                placeholder={searchPlaceholder ?? `Search ${ariaLabel.toLowerCase()}…`}
                value={query}
                aria-label={searchPlaceholder ?? `Search ${ariaLabel.toLowerCase()}`}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    moveActive(1);
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    moveActive(-1);
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    commit(activeIndex);
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    if (query) setQuery('');
                    else close();
                  }
                }}
              />
            </div>
          )}

          {filtered.length === 0 && (
            <div className="dropdown__empty">No matches</div>
          )}

          {filtered.map((option, index) => {
            const isActive = index === activeIndex;
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                data-index={index}
                disabled={option.disabled}
                className={`dropdown__option${isActive ? ' dropdown__option--active' : ''}${
                  isSelected ? ' dropdown__option--selected' : ''
                }`}
                onMouseEnter={() => !option.disabled && setActiveIndex(index)}
                onClick={() => commit(index)}
              >
                {option.leading && (
                  <span className="dropdown__option-leading">{option.leading}</span>
                )}
                <span className="dropdown__option-text">
                  <span className="dropdown__option-label">{option.label}</span>
                  {option.description && (
                    <span className="dropdown__option-desc">{option.description}</span>
                  )}
                </span>
                {option.trailing && (
                  <span className="dropdown__option-trailing">{option.trailing}</span>
                )}
                <span className="dropdown__option-check" aria-hidden="true">
                  {isSelected && <Check size={13} />}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
