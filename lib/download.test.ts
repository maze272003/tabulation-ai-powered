import { describe, expect, it } from "vitest";
import { toCsv } from "./download";

describe("toCsv", () => {
  it("serializes plain rows", () => {
    expect(toCsv(["a", "b"], [[1, "x"], [2, "y"]])).toBe("a,b\r\n1,x\r\n2,y");
  });

  it("escapes commas, quotes, and newlines with surrounding quotes", () => {
    expect(toCsv(["name"], [['Cruz, "Maria"']])).toBe('name\r\n"Cruz, ""Maria"""');
    expect(toCsv(["name"], [["Line1\nLine2"]])).toBe('name\r\n"Line1\nLine2"');
  });

  it("renders null and undefined as empty cells", () => {
    expect(toCsv(["a", "b"], [[null, undefined]])).toBe("a,b\r\n,");
  });
});
