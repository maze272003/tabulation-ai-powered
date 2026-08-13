# Task 9 Report — Entitlements, usage & audit helpers

## Status: DONE

## Commits

- `91bc41f` — `feat: entitlement, usage, and audit helpers`

## Summary

`npm test`: 11/11 pass (9 pre-existing + 2 new pure-function tests); `npm run typecheck` clean (after deleting `tsconfig.tsbuildinfo`).

## Files delivered

| File | Purpose |
| --- | --- |
| `convex/lib/usage.ts` | `getUsage`, `incrementUsage` (MutationCtx helpers over the `usage` table) |
| `convex/lib/entitlements.ts` | `getSubscription`, `getPlan`, `hasFeature`, `hasLimit`, `requireFeature`, `requireLimit` |
| `convex/lib/audit.ts` | `writeAudit` (serializes before/after into `auditLogs`) |
| `convex-test/entitlements.test.ts` | Pure-function tests for `hasFeature` / `hasLimit` only |

## What was implemented verbatim vs. adjusted

### Verbatim from the brief
- `convex/lib/usage.ts` — byte-for-byte from the brief.
- `convex/lib/audit.ts` — byte-for-byte from the brief (imports `serialize` from `./serializers`, confirmed Task 6 export).
- `getSubscription`, `getPlan`, `hasFeature`, `hasLimit`, `requireFeature` in `entitlements.ts` — verbatim.

### Adjusted per task caveats
1. **`requireLimit` ctx typing (caveat 1).** Signature changed from `(ctx: QueryCtx, ...)` with a `getUsage(ctx as never, ...)` cast to `(ctx: MutationCtx, ...)`. The `getUsage(ctx, ...)` call is now clean with no cast. Call sites are all mutations (Task 10/11), so `MutationCtx` is the correct constraint. `getPlan(ctx, ...)` still works because `MutationCtx` extends `QueryCtx`.
2. **Dropped the brief's `entitlements.test.ts` and `audit.test.ts`** — both reference `api.__test__.*` endpoints that were never built (deferred in Task 7). Replaced with the single pure-function test file specified in caveat 5.
3. **One unavoidable micro-adjustment in `requireLimit` for the error context.** `Doc<"plans">["limits"]` is inferred by Convex as the strict shape `{ maxContestants: number; maxEvents: number; maxJudges: number; maxMembers: number }`, which does not have a string index signature. Indexing it with `resource: string` (for the error's `max` field) failed typecheck with `TS7053`. Resolved with a typed local rather than a cast:

   ```ts
   const limits: Record<string, number> = plan.limits;
   throw appError(ErrorCode.LIMIT_EXCEEDED, `Limit reached: ${resource}`, {
     resource,
     current,
     max: limits[resource],
   });
   ```

   This is a structural assignment (every property of `plan.limits` is `number`, so the object is assignable to `Record<string, number>`); **no `as` cast, no `any`**.

## Test results

```
Test Files  5 passed (5)
     Tests  11 passed (11)
```

New tests cover:
- `hasFeature` reads boolean flag (true / false / undefined → false).
- `hasLimit` true below the ceiling, false at and above it (boundary tested at the exact `max`).

## Self-review checklist

| Question | Result |
| --- | --- |
| Does `requireLimit` throw `LIMIT_EXCEEDED` with context? | Yes — `appError(ErrorCode.LIMIT_EXCEEDED, ..., { resource, current, max })` at `convex/lib/entitlements.ts:51`. |
| Does `writeAudit` serialize before/after? | Yes — `serialize(input.before ?? null)`, `serialize(input.after ?? null)` at `convex/lib/audit.ts:24-25`. Nullish inputs normalize to `"null"`. |
| Any `as never` / `any` casts remaining? | No. The brief's `ctx as never` is eliminated (caveat 1). The only non-strict bit is the structural `const limits: Record<string, number> = plan.limits;` local, which is an assignment, not a cast. |
| `getPlan` reads `ctx.db.get(sub.planId)`? | Yes — `convex/lib/entitlements.ts:17`. |
| `audit.ts` imports `serialize` from `./serializers`? | Yes — `convex/lib/audit.ts:3`. |
| Schema indexes used exist? | Yes — `usage.by_org_id_and_resource`, `subscriptions.by_org_id`, `auditLogs` (table) all defined in `convex/schema.ts`. |

## Deferred to Task 10/11 integration tests

The ctx-requiring helpers — `getSubscription`, `requireFeature`, `requireLimit`, `getUsage`, `incrementUsage`, `writeAudit` — are **not covered by unit tests in this task**. They are consolidated into Task 10/11, where the real `organizations` / `members` mutations exercise them through end-to-end flows (org creation writes an audit row; member invite overflows `maxMembers` and throws `LIMIT_EXCEEDED`). This is the intended consolidation noted in the task contract, not a skip.

## Concerns

None. Behavior is faithful to the brief; the only deviation beyond the documented caveats is the typed-local workaround for `Doc<"plans">.limits` indexing, which is forced by Convex's strict inferred shape and is the cleanest available option without a cast.
