import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import type { AIProvider } from '@/core/types';
import { ProviderIcon } from './ProviderIcon';

export interface ModelProviderDropdownProps {
  providers: AIProvider[];
  dynamicModels: Record<string, string[]>;
  builtinModels: Record<string, string[]>;
  activeProvider: string;
  activeModel: string;
  onSelect: (provider: string, model: string) => void;
}

interface Group {
  provider: AIProvider;
  models: string[];
}

/**
 * Model picker that groups every model under the provider that owns it, so the
 * composer shows e.g. "Anthropic → claude-…" and "OpenRouter → …" as sections
 * rather than one flat list. Selecting a model also switches the active provider.
 */
export function ModelProviderDropdown({
  providers,
  dynamicModels,
  builtinModels,
  activeProvider,
  activeModel,
  onSelect,
}: ModelProviderDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const groups = useMemo<Group[]>(() => {
    return providers
      .map((p) => {
        const discovered = dynamicModels[p.id] || [];
        const fromSettings = p.models || [];
        const builtin = builtinModels[p.id] || [];
        const merged = [...new Set([...discovered, ...fromSettings, ...builtin])].filter(Boolean);
        return { provider: p, models: merged };
      })
      .filter((g) => g.models.length > 0);
  }, [providers, dynamicModels, builtinModels]);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        models: g.models.filter((m) => m.toLowerCase().includes(q)),
      }))
      .filter((g) => g.models.length > 0);
  }, [groups, query]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => searchRef.current?.focus());
    else setQuery('');
  }, [open]);

  const activeGroup = groups.find((g) => g.provider.id === activeProvider);

  return (
    <div className={`dropdown model-provider-dd${open ? ' dropdown--open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="dropdown__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Model"
        onClick={() => setOpen((o) => !o)}
      >
        <ProviderIcon id={activeProvider} size={14} />
        <span className="dropdown__trigger-label model-provider-dd__label">{activeModel}</span>
        <ChevronDown size={13} className="dropdown__chevron" aria-hidden="true" />
      </button>

      {open && (
        <div
          className="dropdown__menu glass dropdown__menu--top dropdown__menu--start model-provider-dd__menu"
          role="listbox"
          tabIndex={-1}
        >
          <div className="dropdown__search">
            <Search size={12} className="dropdown__search-icon" aria-hidden="true" />
            <input
              ref={searchRef}
              type="text"
              className="dropdown__search-input"
              placeholder="Search models across providers…"
              value={query}
              aria-label="Search models"
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {filteredGroups.length === 0 && <div className="dropdown__empty">No models found</div>}

          <div className="model-provider-dd__scroll">
            {filteredGroups.map((group) => (
              <div className="model-provider-dd__group" key={group.provider.id}>
                <div className="model-provider-dd__group-head">
                  <ProviderIcon id={group.provider.id} name={group.provider.name} size={15} />
                  <span className="model-provider-dd__group-name">{group.provider.name}</span>
                </div>
                {group.models.map((m) => {
                  const isSelected = group.provider.id === activeProvider && m === activeModel;
                  return (
                    <button
                      key={m}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className={`dropdown__option model-provider-dd__option${
                        isSelected ? ' dropdown__option--selected' : ''
                      }`}
                      onClick={() => {
                        onSelect(group.provider.id, m);
                        setOpen(false);
                      }}
                    >
                      <span className="dropdown__option-label">{m}</span>
                      <span className="dropdown__option-check" aria-hidden="true">
                        {isSelected && <Check size={13} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
