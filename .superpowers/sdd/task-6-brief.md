## Task 6: Error model & serializers

**Files:**
- Create: `convex/lib/errors.ts`
- Create: `convex/lib/serializers.ts`

**Interfaces:**
- Produces: `ErrorCode` union, `appError(code, message, context?)` helper, `serialize(value): string`.

- [ ] **Step 1: Write the failing test**

Create `convex-test/errors.test.ts`:
```ts
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
```

- [ ] **Step 2: Run — expect failure**

Run: `npm test`. Expected: FAIL (modules do not exist).

- [ ] **Step 3: Implement `errors.ts`**

Create `convex/lib/errors.ts`:
```ts
import { ConvexError } from "convex/values";

export const ErrorCode = {
  UNAUTHENTICATED: "UNAUTHENTICATED",
  PROFILE_NOT_PROVISIONED: "PROFILE_NOT_PROVISIONED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  LIMIT_EXCEEDED: "LIMIT_EXCEEDED",
  FEATURE_UNAVAILABLE: "FEATURE_UNAVAILABLE",
  CONFLICT: "CONFLICT",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export type AppErrorData = {
  code: ErrorCode;
  message: string;
  context?: Record<string, unknown>;
};

export function appError(
  code: ErrorCode,
  message: string,
  context?: Record<string, unknown>,
): ConvexError<AppErrorData> {
  return new ConvexError<AppErrorData>({ code, message, context });
}
```

- [ ] **Step 4: Implement `serializers.ts`**

Create `convex/lib/serializers.ts`:
```ts
export function serialize(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function deserialize<T = unknown>(s: string): T {
  return JSON.parse(s) as T;
}
```

- [ ] **Step 5: Run — expect pass**

Run: `npm test`. Expected: the `errors` and `serializers` tests PASS (other suites still fail — fine).

- [ ] **Step 6: Commit**

```powershell
git add convex/lib/errors.ts convex/lib/serializers.ts convex-test/errors.test.ts
git commit -m "feat: typed error model and JSON serializers"
```

---

