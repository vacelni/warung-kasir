'use client';

import { useState, useSyncExternalStore } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { ToggleButton } from '@/components/ui/ToggleButton';
import { isBluetoothSupported } from './bluetooth';
import { PAPER_WIDTHS, type PaperWidth } from './escpos';
import { connectPrinter, forgetPrinter, printTestPage, setPaperWidth } from './print';
import { readPrinterSettings, type PrinterSettings } from './printerSettings';
import { usePrintStatus } from './usePrintStatus';

/** Browser support never changes while the page is open. */
const subscribeNever = () => () => {};

/** Receipt printer section of Lainnya (UI_SPEC A.7): pair a Bluetooth printer, pick paper width, test print. */
export function PrinterPanel() {
  // Rendered only below the sign-in gate, never in the static prerender, so reading this device's
  // storage on the first render cannot disagree with the server HTML.
  const [settings, setSettings] = useState<PrinterSettings>(readPrinterSettings);
  const supported = useSyncExternalStore(subscribeNever, isBluetoothSupported, () => true);
  const { status, run } = usePrintStatus();
  const busy = status.state === 'busy';

  const paired = settings.deviceId !== null;

  return (
    <section aria-label="Printer struk" className="flex flex-col gap-3 px-4 py-3">
      <div className="flex min-h-8 items-center gap-3">
        <Icon name="print" className="shrink-0 text-muted" />
        <span className="min-w-0 flex-1 text-base font-medium text-foreground">Printer struk</span>
        <Badge tone={paired ? 'success' : 'neutral'}>{paired ? 'Terpasang' : 'Belum dipasang'}</Badge>
      </div>

      {!supported && (
        <Alert tone="warning">
          Browser ini tidak mendukung cetak Bluetooth. Gunakan Chrome di Android atau komputer.
        </Alert>
      )}
      {paired && <p className="text-body break-words text-muted">{settings.deviceName}</p>}

      <div role="group" aria-label="Lebar kertas" className="flex flex-col gap-2">
        <p className="text-body text-muted">Lebar kertas</p>
        <div className="grid grid-cols-2 gap-2">
          {PAPER_WIDTHS.map((width) => (
            <PaperButton
              key={width}
              width={width}
              selected={settings.paper === width}
              onSelect={() => setSettings(setPaperWidth(width))}
            />
          ))}
        </div>
      </div>

      <Button
        variant={paired ? 'secondary' : 'primary'}
        className="w-full"
        disabled={busy || !supported}
        onClick={() => void run(async () => setSettings(await connectPrinter()))}
      >
        {paired ? 'GANTI PRINTER' : 'HUBUNGKAN PRINTER'}
      </Button>
      {paired && (
        <>
          <Button variant="secondary" className="w-full" disabled={busy} onClick={() => void run(printTestPage)}>
            {busy ? 'MENCETAK…' : 'CETAK TES'}
          </Button>
          <Button variant="secondary" className="w-full" disabled={busy} onClick={() => setSettings(forgetPrinter())}>
            LUPAKAN PRINTER
          </Button>
        </>
      )}

      {status.state === 'done' && (
        <p role="status" className="text-body text-muted">
          Berhasil.
        </p>
      )}
      {status.state === 'error' && <Alert tone="danger">{status.message}</Alert>}
    </section>
  );
}

function PaperButton({ width, selected, onSelect }: { width: PaperWidth; selected: boolean; onSelect: () => void }) {
  return (
    <ToggleButton selected={selected} onClick={onSelect}>
      {width} mm
    </ToggleButton>
  );
}
