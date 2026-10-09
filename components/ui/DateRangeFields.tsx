import { Input } from './Input';

type DateRangeFieldsProps = {
  fromDay: string;
  toDay: string;
  onFromDayChange: (day: string) => void;
  onToDayChange: (day: string) => void;
  /** Message for an unusable range, shown under the fields. */
  error: string | null;
};

/** Two date fields ("YYYY-MM-DD", both days inclusive) for a custom range: Laporan (A.16) and Riwayat (A.15). */
export function DateRangeFields({ fromDay, toDay, onFromDayChange, onToDayChange, error }: DateRangeFieldsProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3">
        <Input type="date" label="Dari tanggal" value={fromDay} onChange={(event) => onFromDayChange(event.target.value)} />
        <Input type="date" label="Sampai tanggal" value={toDay} onChange={(event) => onToDayChange(event.target.value)} />
      </div>
      {error && (
        <p role="alert" className="text-caption font-medium text-danger-ink">
          {error}
        </p>
      )}
    </div>
  );
}
