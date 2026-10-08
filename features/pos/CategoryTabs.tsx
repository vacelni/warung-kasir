import { cx } from '@/lib/cx';
import type { CatalogCategory } from './filter';

type CategoryTabsProps = {
  categories: readonly CatalogCategory[];
  /** null = "Semua". */
  selectedId: string | null;
  onSelect: (categoryId: string | null) => void;
};

/** Category filter. Wraps onto a second line instead of scrolling sideways (UI rules: no horizontal scroll). */
export function CategoryTabs({ categories, selectedId, onSelect }: CategoryTabsProps) {
  const tabs: Array<{ id: string | null; name: string }> = [{ id: null, name: 'Semua' }, ...categories];

  return (
    <div role="group" aria-label="Kategori menu" className="flex flex-wrap gap-2">
      {tabs.map((tab) => {
        const selected = tab.id === selectedId;
        return (
          <button
            key={tab.id ?? 'semua'}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(tab.id)}
            className={cx(
              'min-h-11 max-w-full rounded-full border px-3 text-body font-medium break-words select-none',
              selected
                ? 'border-primary bg-primary text-white'
                : 'border-border-strong bg-surface text-foreground active:bg-subtle',
            )}
          >
            {tab.name}
          </button>
        );
      })}
    </div>
  );
}
