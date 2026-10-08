import { Icon } from '@/components/ui/Icon';

type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  /** Accessible name of the field. The label stays hidden: the placeholder and icon already say what it is for. */
  label?: string;
  placeholder?: string;
};

/** Search field with a leading magnifier, 48px tall (menu search, history search). */
export function SearchBar({ value, onChange, label = 'Cari menu', placeholder = 'Cari menu...' }: SearchBarProps) {
  return (
    <div className="relative">
      <Icon name="search" size={20} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        placeholder={placeholder}
        autoComplete="off"
        enterKeyHint="search"
        className="min-h-12 w-full rounded-control border border-border-strong bg-surface pr-4 pl-11 text-base text-foreground placeholder:text-muted/70 focus:border-primary"
      />
    </div>
  );
}
