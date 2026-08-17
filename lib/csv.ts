export interface ContestantCsvRow {
  number: number;
  name: string;
  category: string;
  group?: string;
}

export interface CsvRowError {
  rowIndex: number;
  message: string;
}

const VALID_HEADERS_3 = ["number", "name", "category"];

function splitCsvLine(line: string): string[] {
  // Minimal RFC-4180 splitter: double-quoted fields may contain commas and
  // escaped quotes (""), because contestant names can contain commas.
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields.map((field) => field.trim());
}

export function parseContestantCsv(text: string): { rows: ContestantCsvRow[]; errors: CsvRowError[] } {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    return { rows: [], errors: [{ rowIndex: 0, message: "The file is empty." }] };
  }

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const headerOk =
    header.length >= 3 &&
    VALID_HEADERS_3.every((expected, i) => header[i] === expected) &&
    (header.length === 3 || header[3] === "group");
  if (!headerOk) {
    return {
      rows: [],
      errors: [{ rowIndex: 1, message: 'Header must be "number,name,category,group" (group optional).' }],
    };
  }

  const rows: ContestantCsvRow[] = [];
  const errors: CsvRowError[] = [];
  for (const [i, line] of lines.slice(1).entries()) {
    const rowIndex = i + 2; // 1-based file line, header is line 1
    const fields = splitCsvLine(line);
    if (fields.length < 3) {
      errors.push({ rowIndex, message: "Expected at least 3 columns: number, name, category." });
      continue;
    }
    const [numberRaw, name, category, group] = fields;
    const number = Number(numberRaw);
    if (!Number.isInteger(number) || number < 1) {
      errors.push({ rowIndex, message: `"${numberRaw}" is not a positive whole number.` });
      continue;
    }
    if (!name) {
      errors.push({ rowIndex, message: "Name must not be empty." });
      continue;
    }
    if (!category) {
      errors.push({ rowIndex, message: "Category must not be empty." });
      continue;
    }
    rows.push(group ? { number, name, category, group } : { number, name, category });
  }
  return { rows, errors };
}
