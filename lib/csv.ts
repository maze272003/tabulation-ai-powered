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

const NUMBER_ALIASES = ["number", "no", "no.", "#", "contestant_number", "contestant #", "id"];
const NAME_ALIASES = ["name", "full_name", "contestant_name", "contestant", "participant"];
const CATEGORY_ALIASES = ["category", "division", "class", "tier"];
const GROUP_ALIASES = ["group", "team", "organization", "school", "club"];

interface FileLine {
  content: string;
  lineNumber: number;
}

function toNonBlankLines(text: string): FileLine[] {
  return text
    .split(/\r?\n/)
    .map((line, index) => ({ content: line.trim(), lineNumber: index + 1 }))
    .filter((line) => line.content.length > 0);
}

function splitCsvLine(line: string): string[] {
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

function findColumnIndex(headers: string[], aliases: string[]): number {
  return headers.findIndex((h) => aliases.includes(h.toLowerCase().trim()));
}

export function parseContestantCsv(text: string): { rows: ContestantCsvRow[]; errors: CsvRowError[] } {
  const lines = toNonBlankLines(text);
  if (lines.length === 0) {
    return { rows: [], errors: [{ rowIndex: 0, message: "The file is empty." }] };
  }

  const rawHeaders = splitCsvLine(lines[0].content);
  const headerOk =
    rawHeaders.length >= 3 &&
    NUMBER_ALIASES.includes(rawHeaders[0].toLowerCase().trim()) &&
    NAME_ALIASES.includes(rawHeaders[1].toLowerCase().trim()) &&
    CATEGORY_ALIASES.includes(rawHeaders[2].toLowerCase().trim()) &&
    (rawHeaders.length === 3 || GROUP_ALIASES.includes(rawHeaders[3].toLowerCase().trim()));

  if (!headerOk) {
    return {
      rows: [],
      errors: [{ rowIndex: 1, message: 'Header must be "number,name,category,group" (group optional).' }],
    };
  }

  const rows: ContestantCsvRow[] = [];
  const errors: CsvRowError[] = [];
  for (const { content, lineNumber: rowIndex } of lines.slice(1)) {
    const fields = splitCsvLine(content);
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

  if (errors.length > 0) {
    return { rows: [], errors };
  }

  return { rows, errors: [] };
}
