import { CSV_BOM } from '@/lib/csv';

/** Saves CSV text as a UTF-8 file (with BOM for Excel) through a temporary download link. */
export function downloadCsv(fileName: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([CSV_BOM, csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking at once can cancel the download in some browsers; the URL is only needed briefly.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
