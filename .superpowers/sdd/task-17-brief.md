## Task 17: Final verification & cleanup

**Files:**
- Modify: `package.json` (add `seed` script if desired)
- Verify: full quality gate

- [ ] **Step 1: Run the full quality gate**

Run:
```powershell
npm run typecheck; if ($?) { npm run lint }; if ($?) { npm test }; if ($?) { npm run build }
```
Expected: typecheck, lint, tests, and build all PASS.

- [ ] **Step 2: Provision the first Platform Owner**

Decide the bootstrap identity (your own Google account). Sign in once via `/sign-in` so a `userProfile` is created, then in the Convex dashboard (or via `npx convex run`), invoke `platform.setPlatformOwner` with that `userId`. Until this is done, `/platform` is unreachable (by design).

- [ ] **Step 3: Manual smoke test**

1. Visit `/` → click Sign in → complete Google OAuth → land on `/app`.
2. Create an organization → become Owner.
3. Open `/app/<slug>/members` → invite a second email.
4. In a second browser/incognito as the invitee → accept via the invitation link → appear in the members list.
5. Confirm cross-org: try `/app/<other-slug>` as the invitee → refused.
6. Visit `/platform` as the bootstrap platform owner → see both orgs.

- [ ] **Step 4: Run the convex-authz audit skill**

Invoke the `convex-authz` skill against the `convex/` directory to scan for identity-from-arg impersonation, missing ownership checks, and public-PII queries. Fix anything it flags.

- [ ] **Step 5: Commit**

```powershell
git add -A
git commit -m "chore: Phase 1 final verification"
```

---

## Acceptance criteria mapping

| Spec criterion | Verified in |
|---|---|
| Google sign-in; `getUserIdentity()` non-null | Task 3, smoke test |
| Fresh user creates org, becomes Owner | Task 10 + `organizations.test.ts` |
| Owner invites / changes role / removes | Task 11 + `members.test.ts` |
| Cross-tenant refused | Task 10 + `authz.test.ts` |
| Platform Owner lists orgs; normal user blocked | Task 12 + smoke test |
| Billing shows plan/usage; limit → upsell, not crash | Task 9, 11 + billing page |
| Audit row per state change | Task 9 + `audit.test.ts` coverage folded into organizations/members tests |
| typecheck/lint/build/tests green | Task 17 Step 1 |
| convex-authz audit clean | Task 17 Step 4 |
