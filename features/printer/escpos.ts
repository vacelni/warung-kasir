import { formatRupiah } from '@/lib/money';
import { summarizeOptions } from '@/lib/options';
import { formatJakartaDate, formatJakartaTime } from '@/lib/time';
import type { StoreProfile } from '@/features/settings/validation';
import type { TransactionDetail } from '@/features/transactions/model';

/** Paper widths of portable thermal printers, in millimetres. */
export type PaperWidth = 58 | 80;

export const PAPER_WIDTHS: readonly PaperWidth[] = [58, 80];

/** Characters per line in the printer's default font. */
const COLUMNS: Record<PaperWidth, number> = { 58: 32, 80: 48 };

export type ReceiptData = Pick<
  TransactionDetail,
  'code' | 'createdAt' | 'cashierName' | 'lines' | 'total' | 'paidAmount' | 'changeAmount'
>;

/** Only the fields printed on the receipt. Empty ones are skipped, as on the screen receipt. */
export type ReceiptStore = Pick<StoreProfile, 'name' | 'address' | 'phone' | 'receiptNote'>;

const ESC = 0x1b;
const LF = 0x0a;

const INIT = [ESC, 0x40];
const ALIGN = { left: [ESC, 0x61, 0], center: [ESC, 0x61, 1] } as const;
const BOLD_ON = [ESC, 0x45, 1];
const BOLD_OFF = [ESC, 0x45, 0];
/** Blank lines after the last text so the receipt clears the tear bar. Cheap portable printers have no cutter. */
const TRAILING_FEED = 3;
const INDENT = '  ';

/**
 * Printers use a single-byte code page, not Unicode. Accents are removed ("é" → "e"), the
 * multiplication sign becomes "x", and anything else outside printable ASCII becomes "?".
 */
export function toPrinterText(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/×/g, 'x')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^\x20-\x7e]/gu, '?');
}

/** Breaks text into lines of at most `width` characters; a word longer than a line is split. */
export function wrapText(text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let current = '';
    for (const rawWord of toPrinterText(paragraph).split(' ').filter(Boolean)) {
      let word = rawWord;
      while (word.length > width) {
        if (current) {
          lines.push(current);
          current = '';
        }
        lines.push(word.slice(0, width));
        word = word.slice(width);
      }
      if (current === '') current = word;
      else if (current.length + 1 + word.length <= width) current += ` ${word}`;
      else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

/** `label` at the left edge and `value` at the right edge of one line. A label that does not fit wraps above it. */
export function twoColumns(label: string, value: string, width: number): string[] {
  const left = toPrinterText(label);
  const right = toPrinterText(value);
  if (left.length + 1 + right.length <= width) {
    return [left + ' '.repeat(width - left.length - right.length) + right];
  }
  const wrapped = wrapText(left, width);
  return [...wrapped, ' '.repeat(Math.max(0, width - right.length)) + right.slice(-width)];
}

function textBytes(text: string): number[] {
  return Array.from(toPrinterText(text), (char) => char.charCodeAt(0));
}

/**
 * The receipt as ESC/POS bytes (the same content as the on-screen receipt, UI_SPEC A.15): store
 * header, code, WIB time, cashier, items, Total, Bayar, Kembalian, and the receipt note.
 */
export function buildReceiptBytes(detail: ReceiptData, store: ReceiptStore | null, paper: PaperWidth): Uint8Array {
  const width = COLUMNS[paper];
  const rule = '-'.repeat(width);
  const out: number[] = [...INIT];

  const line = (text: string) => out.push(...textBytes(text), LF);
  const lines = (texts: readonly string[]) => texts.forEach(line);
  const center = (texts: readonly string[], bold = false) => {
    out.push(...ALIGN.center);
    if (bold) out.push(...BOLD_ON);
    lines(texts);
    if (bold) out.push(...BOLD_OFF);
    out.push(...ALIGN.left);
  };

  if (store) {
    center(wrapText(store.name, width), true);
    if (store.address) center(wrapText(store.address, width));
    if (store.phone) center(wrapText(store.phone, width));
    line(rule);
  }

  const soldAt = new Date(detail.createdAt);
  line(detail.code);
  lines(twoColumns('Tanggal', `${formatJakartaDate(soldAt)} ${formatJakartaTime(soldAt)} WIB`, width));
  lines(twoColumns('Kasir', detail.cashierName ?? '-', width));
  line(rule);

  for (const item of detail.lines) {
    lines(wrapText(item.productName, width));
    // The choices and the note, indented under the name so the kitchen can read what was ordered.
    if (item.options.length > 0) lines(wrapText(summarizeOptions(item.options, ', '), width - INDENT.length).map((text) => INDENT + text));
    if (item.note) lines(wrapText(`Catatan: ${item.note}`, width - INDENT.length).map((text) => INDENT + text));
    lines(twoColumns(`  ${item.quantity} x ${formatRupiah(item.unitPrice)}`, formatRupiah(item.subtotal), width));
  }
  line(rule);

  out.push(...BOLD_ON);
  lines(twoColumns('Total', formatRupiah(detail.total), width));
  out.push(...BOLD_OFF);
  lines(twoColumns('Bayar', formatRupiah(detail.paidAmount), width));
  lines(twoColumns('Kembalian', formatRupiah(detail.changeAmount), width));

  if (store?.receiptNote) {
    line(rule);
    center(wrapText(store.receiptNote, width));
  }

  out.push(...Array<number>(TRAILING_FEED).fill(LF));
  return Uint8Array.from(out);
}

/** A short sample receipt so the Owner can check the connection and paper width without a real sale. */
export function buildTestBytes(paper: PaperWidth): Uint8Array {
  const width = COLUMNS[paper];
  const out: number[] = [...INIT, ...ALIGN.center, ...BOLD_ON];
  const line = (text: string) => out.push(...textBytes(text), LF);
  line('TES PRINTER');
  out.push(...BOLD_OFF);
  line(`Kertas ${paper} mm`);
  out.push(...ALIGN.left);
  line('-'.repeat(width));
  line('0123456789'.repeat(Math.ceil(width / 10)).slice(0, width));
  line('Printer siap dipakai.');
  out.push(...Array<number>(TRAILING_FEED).fill(LF));
  return Uint8Array.from(out);
}
