import { describe, expect, it } from "vitest";
import { parseContestantCsv } from "./csv";

describe("parseContestantCsv", () => {
  it("parses well-formed rows with and without group", () => {
    const text = [
      "number,name,category,group",
      "1,Maria Santos,Open,Group A",
      "2,Jo Cruz,Open",
    ].join("\n");
    const { rows, errors } = parseContestantCsv(text);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { number: 1, name: "Maria Santos", category: "Open", group: "Group A" },
      { number: 2, name: "Jo Cruz", category: "Open" },
    ]);
  });

  it("supports quoted names containing commas", () => {
    const text = ['number,name,category', '3,"Cruz, Maria",Open'].join("\n");
    const { rows, errors } = parseContestantCsv(text);
    expect(errors).toEqual([]);
    expect(rows[0].name).toBe("Cruz, Maria");
  });

  it("rejects a missing or malformed header", () => {
    const { rows, errors } = parseContestantCsv("name,number,category\n1,Maria,Open");
    expect(rows).toEqual([]);
    expect(errors[0].rowIndex).toBe(1);
  });

  it("rejects an empty file", () => {
    const { rows, errors } = parseContestantCsv("   ");
    expect(rows).toEqual([]);
    expect(errors.length).toBe(1);
  });

  it("reports row-level errors with 1-based line indexes", () => {
    const text = ["number,name,category", "0,Bad Number,Open", "1,,Open", "x,Not A Number,Open"].join("\n");
    const { rows, errors } = parseContestantCsv(text);
    expect(rows).toEqual([]);
    expect(errors).toEqual([
      { rowIndex: 2, message: '"0" is not a positive whole number.' },
      { rowIndex: 3, message: "Name must not be empty." },
      { rowIndex: 4, message: '"x" is not a positive whole number.' },
    ]);
  });

  it("handles CRLF line endings and skips blank lines", () => {
    const text = "number,name,category\r\n\r\n1,Maria,Open\r\n";
    const { rows, errors } = parseContestantCsv(text);
    expect(errors).toEqual([]);
    expect(rows.length).toBe(1);
  });
});
