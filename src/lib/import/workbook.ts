import ExcelJS from 'exceljs';
import type { RawCell } from './cells';
import { type RawRow, IMPORT_COLUMN_LETTERS, rowHasContent } from './normalize';

// Bump when the extraction/normalization contract changes; stored on every
// import batch so a re-parse under a new parser can be told apart (docs/05 S5.1).
export const PARSER_VERSION = 'jj-jobprofit-1';

// Stop scanning after this many consecutive blank rows — the source sheet's
// rowCount is padded far past the ~86 real jobs.
const MAX_TRAILING_BLANKS = 25;

const ERROR_TEXT = /^#(REF|VALUE|DIV\/0|NAME|N\/A|NUM|NULL)!?/i;

export interface ExtractedRow {
  rowNumber: number;
  cells: RawRow;
}

export interface ExtractedWorkbook {
  sheetName: string;
  rows: ExtractedRow[];
}

// Reduce an exceljs cell value (which may be a plain value, a Date, a formula
// object, a shared-formula object, an error object, or rich text) to the neutral
// RawCell the pure parser understands. A formula's cached *result* is the
// effective value; its text is preserved separately so a broken formula stays
// visible rather than reading as zero.
function classifyEffective(address: string, result: unknown, formula: string | null): RawCell {
  if (result === null || result === undefined) {
    return { address, type: 'empty', value: null, formula };
  }
  if (result instanceof Date) {
    return { address, type: 'date', value: result.toISOString(), formula };
  }
  if (typeof result === 'object') {
    const obj = result as Record<string, unknown>;
    if ('error' in obj) {
      return { address, type: 'error', value: String(obj.error), formula };
    }
    if ('richText' in obj && Array.isArray(obj.richText)) {
      const text = (obj.richText as Array<{ text?: string }>).map((t) => t.text ?? '').join('');
      return { address, type: 'string', value: text, formula };
    }
    if ('text' in obj) {
      return { address, type: 'string', value: String(obj.text), formula };
    }
    return { address, type: 'string', value: JSON.stringify(obj), formula };
  }
  if (typeof result === 'number') {
    return { address, type: 'number', value: result, formula };
  }
  if (typeof result === 'boolean') {
    return { address, type: 'string', value: String(result), formula };
  }
  const s = String(result);
  if (ERROR_TEXT.test(s)) {
    return { address, type: 'error', value: s, formula };
  }
  return { address, type: 'string', value: s, formula };
}

function toRawCell(cell: ExcelJS.Cell): RawCell {
  const address = cell.address;
  const value = cell.value;

  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    const obj = value as unknown as Record<string, unknown>;
    if ('formula' in obj || 'sharedFormula' in obj) {
      const formula =
        typeof obj.formula === 'string'
          ? obj.formula
          : typeof obj.sharedFormula === 'string'
            ? `shared:${obj.sharedFormula}`
            : null;
      return classifyEffective(address, obj.result ?? null, formula);
    }
    if ('error' in obj) {
      return { address, type: 'error', value: String(obj.error), formula: null };
    }
  }

  return classifyEffective(address, value ?? null, null);
}

export async function extractWorkbook(bytes: Buffer | ArrayBuffer): Promise<ExtractedWorkbook> {
  const workbook = new ExcelJS.Workbook();
  const buffer = bytes instanceof Buffer ? bytes : Buffer.from(new Uint8Array(bytes));
  // exceljs's Buffer typing is its own; the cast keeps the call honest.
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  const sheet =
    workbook.worksheets.find((w) => w.name.toLowerCase().includes('job profit')) ??
    workbook.worksheets[0];
  if (!sheet) {
    throw new Error('Workbook contains no worksheets');
  }

  const rows: ExtractedRow[] = [];
  let trailingBlanks = 0;
  const lastRow = sheet.rowCount;

  // Row 1 is the header; data begins at row 2.
  for (
    let rowNumber = 2;
    rowNumber <= lastRow && trailingBlanks < MAX_TRAILING_BLANKS;
    rowNumber++
  ) {
    const row = sheet.getRow(rowNumber);
    const cells: RawRow = {};
    IMPORT_COLUMN_LETTERS.forEach((letter, index) => {
      cells[letter] = toRawCell(row.getCell(index + 1));
    });

    if (!rowHasContent(cells)) {
      trailingBlanks++;
      continue;
    }
    trailingBlanks = 0;
    rows.push({ rowNumber, cells });
  }

  return { sheetName: sheet.name, rows };
}
