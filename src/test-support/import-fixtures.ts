import ExcelJS from 'exceljs';

// Cell values as they arrive from a spreadsheet: a number, text, a Date, a
// formula object, or blank. A broken formula's cached error is simulated with
// the plain string '#REF!' (exactly what exceljs returns for the real sheet).
export type CellSpec = number | string | Date | null | { formula: string; result: unknown };

export type WorkbookRow = Partial<Record<string, CellSpec>>;

function columnIndex(letter: string): number {
  return letter.toUpperCase().charCodeAt(0) - 64;
}

// Builds an in-memory .xlsx whose first sheet is named "Job Profit", with the
// given data rows starting at row 2 (row 1 is a throwaway header).
export async function makeImportWorkbook(rows: WorkbookRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Job Profit');
  sheet.getRow(1).getCell(1).value = 'Job Profit header';

  rows.forEach((row, index) => {
    const excelRow = sheet.getRow(index + 2);
    for (const [letter, value] of Object.entries(row)) {
      excelRow.getCell(columnIndex(letter)).value = value as ExcelJS.CellValue;
    }
    excelRow.commit();
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// A representative slice of the real sheet's defects (docs/05 S2 / reconcile
// diagnostic): one clean row plus rows exercising every validator.
export function defectWorkbookRows(): WorkbookRow[] {
  return [
    // Clean, fully specified — commits without exceptions.
    { A: 'Clean Job', B: '1 Main St', C: 2000, D: 3000, E: 10000, G: 5000, H: 'Kyle', I: 0.4 },
    // Missing payout + missing address (negative-profit / row 2 pattern) — blocked.
    { A: 'Charlie Dao', C: 1500, D: 7557.75 },
    // #REF! in payout (blocker) and in commission (warning).
    { A: 'John Delaney', B: '205 jackrabbit dr', E: '#REF!', J: '#REF!' },
    // Payment narrative in the commission cell (row 18).
    {
      A: 'Julie Wiley',
      B: '10 Rental Rd',
      E: 202411.96,
      J: 'Ian Paid: 11,359.89 on 12/11. Justin paid 11,360 on 12/11.',
    },
    // Percentage typed as a whole number (row 61).
    { A: 'Rebecca Ballesteros', B: '61 Jan Ln', E: 13909.44, I: 60 },
    // Ambiguous split rep (row 19).
    { A: 'Annissa', B: '2 Cedar St', E: 10000, H: 'Ian/Justin' },
    // Duplicate name + address of the row below.
    { A: 'Dion Edge', B: '9 Repeat Rd', E: 8000, H: 'Ian' },
    { A: 'Dion Edge', B: '9 Repeat Rd', E: 9000, H: 'Justin' },
  ];
}
