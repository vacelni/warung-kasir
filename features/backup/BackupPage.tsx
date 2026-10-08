'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useProfile } from '@/features/auth/AuthProvider';
import { toCsv } from '@/lib/csv';
import { DATASETS, exportFileName, type Dataset, type DatasetKey } from './datasets';
import { downloadCsv } from './download';

const FAILED = 'Export gagal. Data tidak dapat diambil dari server. Periksa koneksi internet lalu coba lagi.';

/** Short pause between files, so the browser treats "Backup Data" as a series of downloads. */
const BETWEEN_FILES_MS = 400;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Backup / Export (PRD §27, decision C26/C27). Backup means CSV export: one file per table, or
 * all six at once. There is no restore, and the page says so.
 */
export function BackupPage() {
  const { storeId } = useProfile();
  const toast = useToast();
  const [busy, setBusy] = useState<DatasetKey | 'all' | null>(null);
  const [failure, setFailure] = useState<string>();

  async function exportOne(dataset: Dataset) {
    if (busy) return;
    setBusy(dataset.key);
    setFailure(undefined);
    try {
      const table = await dataset.load(storeId);
      downloadCsv(exportFileName(dataset, new Date()), toCsv(table.columns, table.rows));
      toast.show(`${dataset.label.replace('Export ', '')} diunduh (${table.rows.length} baris).`, 'success');
    } catch (error) {
      console.error(`Export of ${dataset.key} failed:`, error);
      setFailure(FAILED);
    } finally {
      setBusy(null);
    }
  }

  /** Reads every table first, so a failure leaves no half-finished set of files behind. */
  async function exportAll() {
    if (busy) return;
    setBusy('all');
    setFailure(undefined);
    try {
      const tables = await Promise.all(DATASETS.map(async (dataset) => ({ dataset, table: await dataset.load(storeId) })));
      const now = new Date();
      for (const [index, { dataset, table }] of tables.entries()) {
        if (index > 0) await wait(BETWEEN_FILES_MS);
        downloadCsv(exportFileName(dataset, now), toCsv(table.columns, table.rows));
      }
      toast.show(`Backup selesai: ${tables.length} file CSV diunduh.`, 'success');
    } catch (error) {
      console.error('Backup failed:', error);
      setFailure(FAILED);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <PageHeader title="Backup / Export" description="Unduh data warung sebagai file CSV untuk disimpan atau dibuka di spreadsheet." />

      <Alert tone="warning" role="note">
        <p className="font-semibold">CSV bukan cadangan lengkap.</p>
        <ul className="mt-1 list-disc pl-5">
          <li>Data dari file CSV tidak dapat dipulihkan (restore) ke aplikasi.</li>
          <li>Transaksi yang masih tersimpan di perangkat dan belum tersinkron belum termasuk.</li>
          <li>Simpan file di tempat yang aman: berisi data penjualan warung.</li>
        </ul>
      </Alert>

      {failure && <Alert tone="danger">{failure}</Alert>}

      <section aria-labelledby="backup-all" className="flex flex-col gap-2">
        <h2 id="backup-all" className="text-section-title font-semibold text-foreground">
          Backup Data
        </h2>
        <Card className="flex flex-col gap-3">
          <p className="text-body text-muted">
            Mengunduh {DATASETS.length} file CSV sekaligus: transaksi, item transaksi, menu, kategori, profil warung, dan karyawan.
            Browser mungkin meminta izin untuk mengunduh beberapa file.
          </p>
          <Button onClick={() => void exportAll()} disabled={busy !== null} className="w-full">
            <Icon name="download" size={20} />
            {busy === 'all' ? 'MENYIAPKAN FILE…' : 'BACKUP DATA'}
          </Button>
        </Card>
      </section>

      <section aria-labelledby="backup-each" className="flex flex-col gap-2">
        <h2 id="backup-each" className="text-section-title font-semibold text-foreground">
          Export per data
        </h2>
        <Card padded={false}>
          <ul className="divide-y divide-border">
            {DATASETS.map((dataset) => (
              <li key={dataset.key} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-base font-semibold text-foreground">{dataset.label}</p>
                  <p className="text-caption text-muted">{dataset.description}</p>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => void exportOne(dataset)}
                  disabled={busy !== null}
                  className="shrink-0"
                  // Starts with the visible text, then says which file (WCAG 2.5.3).
                  aria-label={`${busy === dataset.key ? 'MENYIAPKAN…' : 'UNDUH CSV'} ${dataset.label}`}
                >
                  {busy === dataset.key ? 'MENYIAPKAN…' : 'UNDUH CSV'}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </div>
  );
}
