import { describe, expect, it } from "vitest";
import { appError, ErrorCode } from "../convex/lib/errors";
import { serialize } from "../convex/lib/serializers";

describe("errors", () => {
  it("produces a ConvexError with a stable code", () => {
    const err = appError("FORBIDDEN", "no access");
    expect(err.data).toMatchObject({ code: "FORBIDDEN", message: "no access" });
    expect(err.message).toBe("no access");
  });

  it("includes optional context", () => {
    const err = appError("LIMIT_EXCEEDED", "too many", { resource: "members" });
    expect(err.data).toMatchObject({ code: "LIMIT_EXCEEDED", context: { resource: "members" } });
  });
});

describe("serializers", () => {
  it("round-trips an object via JSON", () => {
    expect(serialize({ a: 1 })).toBe('{"a":1}');
  });
  it("serializes null and undefined safely", () => {
    expect(serialize(null)).toBe("null");
    expect(serialize(undefined)).toBe("null");
  });
});
