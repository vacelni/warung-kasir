import { describe, expect, it } from 'vitest';
import { csvCell, neutralizeFormula, toCsv } from './csv';

/** Minimal RFC 4180 reader for round-trip checks (quoted fields, doubled quotes, CRLF). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\r' && text[i + 1] === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
    } else field += char;
  }
  return rows;
}

describe('H12: formula injection', () => {
  it.each([
    ['=1+1', "'=1+1"],
    ['+62812345', "'+62812345"],
    ['-2+3', "'-2+3"],
    ['@SUM(A1:A2)', "'@SUM(A1:A2)"],
    ['=HYPERLINK("http://evil.example","klik")', '\'=HYPERLINK("http://evil.example","klik")'],
    ['=cmd|\' /C calc\'!A0', '\'=cmd|\' /C calc\'!A0'],
    ['\t=1+1', "'\t=1+1"],
    ['\r=1+1', "'\r=1+1"],
    ['   =1+1', "'   =1+1"],
  ])('neutralizes %j', (input, expected) => {
    expect(neutralizeFormula(input)).toBe(expected);
  });

  it.each(['Nasi Goreng', 'a=b', 'Es teh - manis', 'info@warung.test', "'sudah aman", ''])('leaves %j alone', (text) => {
    expect(neutralizeFormula(text)).toBe(text);
  });

  it('writes a neutralized cell quoted, so the apostrophe and the payload stay one text cell', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    const [[cell]] = parseCsv(`${csvCell('@SUM(1,2)')}\r\n`) as [[string]];
    expect(cell).toBe("'@SUM(1,2)");
  });

  it('protects header cells too', () => {
    expect(toCsv(['=evil'], [])).toBe('"\'=evil"\r\n');
  });
});

describe('quoting', () => {
  it.each([
    ['Nasi, Goreng', '"Nasi, Goreng"'],
    ['Es "Jumbo"', '"Es ""Jumbo"""'],
    ['Jl. Contoh No. 10\nSemarang', '"Jl. Contoh No. 10\nSemarang"'],
    ['baris\r\nbaru', '"baris\r\nbaru"'],
    ['  spasi  ', '"  spasi  "'],
    ['', '""'],
  ])('quotes %j', (input, expected) => {
    expect(csvCell(input)).toBe(expected);
  });

  it('writes numbers, booleans, and null raw', () => {
    expect(csvCell(15000)).toBe('15000');
    expect(csvCell(0)).toBe('0');
    expect(csvCell(true)).toBe('true');
    expect(csvCell(false)).toBe('false');
    expect(csvCell(null)).toBe('');
  });

  it('refuses a non-finite number instead of writing "NaN"', () => {
    expect(() => csvCell(Number.NaN)).toThrow(RangeError);
    expect(() => csvCell(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe('toCsv', () => {
  it('writes a header and rows with CRLF line ends', () => {
    expect(toCsv(['name', 'price', 'is_active'], [['Es Teh', 5000, true], ['Kerupuk', 2000, false]])).toBe(
      '"name","price","is_active"\r\n"Es Teh",5000,true\r\n"Kerupuk",2000,false\r\n',
    );
  });

  it('round-trips awkward values through an RFC 4180 reader', () => {
    const values = ['Nasi, "Spesial"', 'dua\nbaris', '  tepi  ', '', 'Soto 🍜 Ayam'];
    const parsed = parseCsv(toCsv(['a', 'b', 'c', 'd', 'e'], [values]));
    expect(parsed).toEqual([['a', 'b', 'c', 'd', 'e'], values]);
  });

  it('rejects a row with the wrong number of cells', () => {
    expect(() => toCsv(['a', 'b'], [['x']])).toThrow('CSV row 1 has 1 cells; expected 2.');
  });
});
