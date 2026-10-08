import { Icon } from '@/components/ui/Icon';

type SearchBarProps = { value: string; onChange: (value: string) => void };

/** Menu search. The label is hidden because the placeholder and icon already say what the field is for. */
export function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className="relative">
      <Icon name="search" size={20} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Cari menu"
        placeholder="Cari menu..."
        autoComplete="off"
        enterKeyHint="search"
        className="min-h-12 w-full rounded-control border border-border-strong bg-surface pr-4 pl-11 text-base text-foreground placeholder:text-muted/70 focus:border-primary"
      />
    </div>
  );
}
