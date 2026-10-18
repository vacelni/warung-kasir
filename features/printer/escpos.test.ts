import { describe, expect, it } from 'vitest';
import { buildReceiptBytes, buildTestBytes, toPrinterText, twoColumns, wrapText, type ReceiptData } from './escpos';

const detail: ReceiptData = {
  code: 'TRX-20261007-3F9A2C',
  createdAt: '2026-10-07T03:32:00.000Z',
  cashierName: 'Andi',
  lines: [
    { productName: 'Es Teh', unitPrice: 5000, quantity: 2, subtotal: 10000, options: [], note: null },
    { productName: 'Nasi Goreng', unitPrice: 15000, quantity: 2, subtotal: 30000, options: [], note: null },
  ],
  total: 40000,
  paidAmount: 50000,
  changeAmount: 10000,
};

const store = { name: 'Warung Bu Sari', address: 'Jl. Contoh No. 10', phone: '08123456789', receiptNote: 'Terima kasih :)' };

/** The printable text of the bytes: control commands removed, lines split. */
function textLines(bytes: Uint8Array): string[] {
  const text: string[] = [];
  let line = '';
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i]!;
    if (byte === 0x1b) {
      // ESC @ is two bytes; ESC a n and ESC E n are three.
      i += bytes[i + 1] === 0x40 ? 1 : 2;
    } else if (byte === 0x0a) {
      text.push(line);
      line = '';
    } else {
      line += String.fromCharCode(byte);
    }
  }
  return text;
}

describe('toPrinterText', () => {
  it('keeps plain ASCII, drops accents, and replaces what a printer cannot print', () => {
    expect(toPrinterText('Nasi Goreng')).toBe('Nasi Goreng');
    expect(toPrinterText('Café')).toBe('Cafe');
    expect(toPrinterText('2 × 5')).toBe('2 x 5');
    expect(toPrinterText('Mie 🍜')).toBe('Mie ?');
    expect(toPrinterText('a\nb')).toBe('a b');
  });
});

describe('wrapText', () => {
  it('wraps at word boundaries', () => {
    expect(wrapText('Nasi Goreng Special Pedas', 12)).toEqual(['Nasi Goreng', 'Special', 'Pedas']);
  });

  it('splits a word longer than the line', () => {
    expect(wrapText('ABCDEFGHIJ', 4)).toEqual(['ABCD', 'EFGH', 'IJ']);
  });

  it('keeps explicit line breaks and ignores empty text', () => {
    expect(wrapText('Terima kasih\nSampai jumpa', 32)).toEqual(['Terima kasih', 'Sampai jumpa']);
    expect(wrapText('', 32)).toEqual([]);
  });
});

describe('twoColumns', () => {
  it('puts the value at the right edge of exactly the line width', () => {
    const [row] = twoColumns('Total', 'Rp40.000', 32);
    expect(row).toHaveLength(32);
    expect(row!.startsWith('Total')).toBe(true);
    expect(row!.endsWith('Rp40.000')).toBe(true);
  });

  it('wraps a label that cannot share the line with its value', () => {
    const rows = twoColumns('Nasi Goreng Special Pedas Level 5', 'Rp40.000', 20);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.every((row) => row.length <= 20)).toBe(true);
    expect(rows.at(-1)!.endsWith('Rp40.000')).toBe(true);
  });
});

describe('buildReceiptBytes', () => {
  it('starts with ESC @ and prints the sale as on the screen receipt', () => {
    const bytes = buildReceiptBytes(detail, store, 58);
    expect([...bytes.slice(0, 2)]).toEqual([0x1b, 0x40]);

    const lines = textLines(bytes);
    expect(lines).toContain('Warung Bu Sari');
    expect(lines).toContain('Jl. Contoh No. 10');
    expect(lines).toContain('TRX-20261007-3F9A2C');
    expect(lines.some((l) => l.startsWith('Tanggal') && l.endsWith('07/10/2026 10:32 WIB'))).toBe(true);
    expect(lines.some((l) => l.startsWith('Kasir') && l.endsWith('Andi'))).toBe(true);
    expect(lines.some((l) => l.startsWith('  2 x Rp5.000') && l.endsWith('Rp10.000'))).toBe(true);
    expect(lines.some((l) => l.startsWith('Total') && l.endsWith('Rp40.000'))).toBe(true);
    expect(lines.some((l) => l.startsWith('Bayar') && l.endsWith('Rp50.000'))).toBe(true);
    expect(lines.some((l) => l.startsWith('Kembalian') && l.endsWith('Rp10.000'))).toBe(true);
    expect(lines).toContain('Terima kasih :)');
  });

  it('prints the chosen options and the note under the item name, indented and wrapped to the paper', () => {
    const geprek: ReceiptData = {
      ...detail,
      lines: [
        {
          productName: 'Geprek',
          unitPrice: 19000,
          quantity: 2,
          subtotal: 38000,
          options: [
            { group: 'Nasi', name: 'Pakai nasi', price: 4000 },
            { group: 'Level', name: 'Level 3', price: 0 },
            { group: 'Bagian ayam', name: 'Dada', price: 3000 },
            { group: 'Tambahan', name: 'Telur dadar', price: 3000 },
          ],
          note: 'sambal dipisah',
        },
      ],
      total: 38000,
      paidAmount: 40000,
      changeAmount: 2000,
    };
    const lines = textLines(buildReceiptBytes(geprek, store, 58));
    const at = lines.indexOf('Geprek');

    expect(at).toBeGreaterThan(-1);
    expect(lines.slice(at + 1, at + 4)).toEqual(['  Pakai nasi, Level 3, Dada,', '  Telur dadar', '  Catatan: sambal dipisah']);
    expect(lines[at + 4]).toMatch(/^ {2}2 x Rp19\.000 +Rp38\.000$/);
    expect(lines.every((line) => line.length <= 32)).toBe(true);
  });

  it('uses the sale time in Asia/Jakarta, not the device time zone', () => {
    // 23:30 UTC on 7 Oct is 06:30 WIB on 8 Oct.
    const bytes = buildReceiptBytes({ ...detail, createdAt: '2026-10-07T23:30:00.000Z' }, store, 58);
    expect(textLines(bytes).some((l) => l.endsWith('08/10/2026 06:30 WIB'))).toBe(true);
  });

  it('fits every line to the paper: 32 characters at 58 mm, 48 at 80 mm', () => {
    const long = {
      ...detail,
      lines: [{ productName: 'Nasi Goreng Spesial Ayam Kampung Pedas Level Lima', unitPrice: 15000, quantity: 12, subtotal: 180000, options: [], note: null }],
      total: 180000,
      paidAmount: 200000,
      changeAmount: 20000,
    };
    for (const [paper, width] of [[58, 32], [80, 48]] as const) {
      const lines = textLines(buildReceiptBytes(long, store, paper));
      expect(lines.every((line) => line.length <= width)).toBe(true);
    }
  });

  it('leaves out the store header and note when they are not set, and prints a missing cashier as a dash', () => {
    const lines = textLines(buildReceiptBytes({ ...detail, cashierName: null }, null, 58));
    expect(lines[0]).toBe('TRX-20261007-3F9A2C');
    expect(lines.some((l) => l.startsWith('Kasir') && l.endsWith('-'))).toBe(true);
    const sparse = textLines(buildReceiptBytes(detail, { name: 'Warung', address: null, phone: null, receiptNote: null }, 58));
    expect(sparse[0]).toBe('Warung');
    expect(sparse).not.toContain('Terima kasih :)');
  });

  it('only contains bytes a printer can take: commands, line feeds, and printable ASCII', () => {
    const odd = { ...detail, lines: [{ productName: 'Mie Ayam 🍜 Café', unitPrice: 1000, quantity: 1, subtotal: 1000, options: [], note: null }] };
    const text = textLines(buildReceiptBytes(odd, store, 58)).join('\n');
    expect(text).toContain('Mie Ayam ? Cafe');
    expect([...text].every((char) => char === '\n' || (char >= ' ' && char <= '~'))).toBe(true);
  });
});

describe('buildTestBytes', () => {
  it('names the paper width and fills one line', () => {
    const lines = textLines(buildTestBytes(80));
    expect(lines).toContain('Kertas 80 mm');
    expect(lines).toContain('-'.repeat(48));
  });
});
