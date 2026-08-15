# Task 13 Report: UI — config editors (rounds, categories, contestants, judges)

**Status:** DONE

## Files created (committed in 7632b94)

- `app/app/[orgSlug]/events/[eventSlug]/rounds/page.tsx` — rounds + criteria editor (verbatim from brief Step 1)
- `app/app/[orgSlug]/events/[eventSlug]/categories/page.tsx` — categories editor (verbatim from brief Step 2)
- `app/app/[orgSlug]/events/[eventSlug]/contestants/page.tsx` — contestants editor (verbatim from brief Step 3)
- `app/app/[orgSlug]/events/[eventSlug]/judges/page.tsx` — judges + assignments editor (brief Step 4 + user-adjudicated typed-state deviation)

Rounds, categories, contestants pages are transcribed verbatim from the brief. Judges page applies only the adjudicated deviation (below); everything else in it is verbatim.

## Typed-state deviation (judges page, per binding user decision)

- State is properly typed instead of `as never` casts:
  - `const [picked, setPicked] = useState<Id<"userProfiles"> | "">("");`
  - `const [roundPick, setRoundPick] = useState<Id<"rounds"> | "">("");`
- Import: `import type { Id } from "@/convex/_generated/dataModel";`
- onChange handlers use the single sanctioned boundary assertion from `string` to the union (the page controls every rendered `<option>` value, so the DOM value is always one of them or `""`):
  - `onChange={(e) => setPicked(e.target.value as Id<"userProfiles"> | "")}`
  - `onChange={(e) => setRoundPick(e.target.value as Id<"rounds"> | "")}`
- `judges.add` call passes state directly with zero casts after control-flow narrowing. `Id | ""` is not assignable to the required `userId: Id<"userProfiles">` (the `disabled={!picked}` prop does not narrow), so the handler begins with `if (picked === "") return;`, which narrows `picked` to `Id<"userProfiles">`; then `await add({ orgSlug, eventSlug, userId: picked });` passes the narrowed value directly — no `as never`, no `any`, no helper-cast.
- `addAssignment` call is exactly the adjudicated form: `roundId: roundPick === "" ? undefined : roundPick` (ternary itself narrows the union; no assertion needed).
- Typecheck confirmed this compiles cleanly — no BLOCKED scenario arose.

## Verification (gate per brief Step 5)

| Gate | Command | Result |
|---|---|---|
| Typecheck | `Remove-Item -Force tsconfig.tsbuildinfo; npm run typecheck` | exit 0, no errors |
| Lint | `npm run lint` | 0 errors, 11 warnings — all pre-existing in unrelated files (`convex-test/*`, `convex/betterAuth/_generated/*`, `convex/{invitations,organizations,seed,templates}.ts`); zero findings in the 4 new pages |
| Build | `npm run build` | Success; routes `/app/[orgSlug]/events/[eventSlug]/{rounds,categories,contestants,judges}` all registered (dynamic) |
| Tests | `npm test` | 13 files, 58/58 passed |

## API surface verification (pre-flight, no backend changes made)

Confirmed against source before writing pages:
- `rounds.list` returns rounds with embedded `criteria` (`_id`, `name`, `weight`, `minScore`, `maxScore`) — matches table rendering and weight-sum indicator.
- `criteria.add` requires `decimalPrecision: v.number()` — page passes `0` per brief.
- `events.get` returns `Doc<"events"> | null`; events `status` union is `"draft" | "ready" | "archived"` — `locked = ev !== undefined && ev !== null && ev.status !== "draft"` is sound.
- `members.list` returns `{ userId, status, name, email, ... }` — candidate filtering (`status === "active"`, excluding existing judges) typechecks.
- `judges.add` takes `userId: v.id("userProfiles")`; `judges.addAssignment` takes optional `roundId: v.id("rounds")` — matches typed-state deviation.
- `contestants.list` returns `{ _id, number, name, categoryId, status }`; `categories.list` returns `{ _id, name }` — matches contestants table columns and category lookup.

## Locked-state gating

- Rounds page: `!locked` gates the add-round row, round Remove buttons, criterion Remove buttons, and the per-round add-criterion form. Locked events render read-only round cards with criteria tables and weight totals.
- Categories/contestants/judges pages: no local lock gating (per brief, verbatim); the server's `requireDraftEvent` rejects non-draft edits and every action renders an error toast reading `.data.code` / `.data.message` (CONFLICT → locked/conflict message; LIMIT_EXCEEDED → plan-limit message; otherwise server message).
- While `events.get` loads (`ev === undefined`), `locked` is false, so controls render; a failed/locked mutation still surfaces the server error via toast. This matches the brief's code exactly.

## Self-review

- Pages match the brief verbatim except the adjudicated judges-page state typing (documented above).
- Grep across all 4 files for `as never`, `as any`, `: any`, `<any>`, `//`, `/*` → zero matches (no comments, no forbidden casts).
- The only type assertions in the new pages are the two sanctioned DOM-boundary assertions on the judges page plus the brief's own `(err as { data?: ... })` error-shape reads present verbatim in all four `onError` handlers.
- Commit staged exactly the 4 page files; unrelated user WIP (`app/graphify/`, `package.json`, `.gitignore`, `.graphifyignore`, `.superpowers/`) was not staged and remains in the working tree.

## Concerns

None blocking. Two observations for future tasks:
1. The rounds page's per-criterion add form defaults `min`/`max` to "0"/"100" and resets `name`/`weight` only after add (verbatim brief behavior) — fine as specified.
2. The judges page's `roundPick` select is shared across all judge cards (single state, verbatim brief behavior) — selecting a round applies to the next Assign click on any judge. Kept as-is per "verbatim" requirement; flagging only as UX follow-up material, not a defect.

## Fix: per-judge round select

**Change** (user-approved review fix, commit `2ace183`): Replaced the single shared `roundPick` state on `app/app/[orgSlug]/events/[eventSlug]/judges/page.tsx` with a per-judge record `const [roundPicks, setRoundPicks] = useState<Record<string, Id<"rounds"> | "">>({});`. Inside each judge card, `const roundPick = roundPicks[j._id] ?? "";` reads that judge's selection; the select's `onChange` writes `{ ...roundPicks, [j._id]: e.target.value as Id<"rounds"> | "" }` (same sanctioned DOM-boundary assertion style); the Assign call keeps `roundId: roundPick === "" ? undefined : roundPick`; after a successful `addAssignment`, that judge's entry resets to `""` via `setRoundPicks({ ...roundPicks, [j._id]: "" })`. No other lines or files touched; no comments, no `any`/`as never`. The judge `map` arrow gained a block body (`{ const roundPick = ...; return ( ... ); }`) to scope the per-card read.

**Commands + results:**
1. `Remove-Item -LiteralPath "tsconfig.tsbuildinfo" -Force; npm run typecheck` -> exit 0, no output (tsc --noEmit clean after tsbuildinfo cleared).
2. `npm run lint` -> exit 0: `0 errors, 11 warnings` (all 11 pre-existing: unused vars in convex-test, unused eslint-disable in betterAuth generated files, no-filter-in-query warnings in convex/*.ts; none in the judges page).
3. `npm run build` -> succeeded: typecheck re-ran clean, Next.js 16.3.0 (Turbopack) compiled successfully in 3.6s, TypeScript finished, all 20 routes generated (only the pre-existing middleware-deprecation warning). `/app/[orgSlug]/events/[eventSlug]/judges` present in route output.
4. `npm test` -> `Test Files 13 passed (13)`, `Tests 58 passed (58)` (vitest 4.1.10, 6.79s). 58/58 as required.

**Commit:** staged only `app/app/[orgSlug]/events/[eventSlug]/judges/page.tsx` (git status confirmed all user WIP unstaged); `git commit -m "fix: per-judge round selection on judges page"` -> `2ace1839ae561a2a30b932953c2ff082c8b479c3` on `phase2-competition-config`, 1 file changed, 8 insertions(+), 4 deletions(-). Post-commit status shows the judges page clean; user WIP remains untouched in the working tree.

This resolves the "Concerns" item 2 above (shared round-select UX), which was the flagged review finding.
