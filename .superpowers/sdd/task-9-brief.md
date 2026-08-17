### Task 9: Full validation + Graphify refresh

**Files:**
- No new files. Runs all gates.

- [ ] **Step 1: Run the complete test suite**

```powershell
npm run test
```

Expected: all tests pass, including all pre-existing suites (no regressions from the `changePlan` semantic change or schema additions).

- [ ] **Step 2: Lint, typecheck, build**

```powershell
npm run lint; if ($?) { npm run typecheck }; if ($?) { npm run build }
```

Expected: all three pass.

- [ ] **Step 3: Refresh Graphify context**

```powershell
npm run graphify:build
```

Expected: completes without errors.

- [ ] **Step 4: Commit generated context**

```powershell
git add .graphify
git commit -m "chore: refresh graphify context for billing module"
```

(If `.graphify` is fully gitignored, `git add` reports nothing to commit — skip the commit.)

- [ ] **Step 5: Manual smoke checklist (documented for the operator — do not block)**

The implementer cannot complete a real PayMongo payment. Leave the repo with this checklist printed in the task report:
1. `npx convex env set PAYMONGO_SECRET_KEY=sk_test_...`, `PAYMONGO_WEBHOOK_SECRET=...`, `PAYMONGO_LIVEMODE=false`, `SITE_URL=http://localhost:3000`
2. Register webhook `http://localhost:3000/paymongo/webhook` (or a tunnel URL) in the PayMongo dashboard with the checkout_session events.
3. Buy Starter with the test GCash/card flows from PayMongo's testing docs; verify the subscription flips to active and history shows paid.

---

## Post-Plan Notes for Reviewers

- `convex/_generated` files change via `npx convex codegen`; commit them with the task that caused the change (they are tracked in this repo).
- The `changePlan` semantic change (immediate switch → cancel-at-period-end) intentionally removes the old behavior; the only in-repo consumer was the Phase 1 stub itself and the superadmin override path (`superadmin/billing.setPlan`), which is untouched.
- Money is always integer centavos; `formatPeso` is the only place division by 100 happens.
