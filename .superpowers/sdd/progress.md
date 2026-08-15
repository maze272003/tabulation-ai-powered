# Phase 2 SDD Progress Ledger

Plan: docs/superpowers/plans/2026-08-13-phase2-competition-config.md
Branch: phase2-competition-config
Pre-flight resolution: Task 13 uses Id<...>-typed select state (NO `as never` casts) — user decision 2026-08-15.

## Completed tasks

Task 1: complete (commits 411f391..e34a8a3, review clean)
- Minor (final-review triage): task-1-report.md claims 20 new indexes; actual 19 (report-only, code correct)

Task 2: complete (commits e34a8a3..02b5762, review clean; 3 justified deviations from brief code: orgId omission, q.and() filter, typed SYSTEM_TEMPLATES annotation - verified by reviewer)
- Minor (final-review triage): task-2-report.md stat line +75/-8 vs actual +82/-7 (report-only)

Task 3: complete (commits 02b5762..ea08453, review clean)

Task 4: complete (commits ea08453..27a82e3, review clean; deviation: dup-slug check before requireLimit - brief code unpassable otherwise; codegen api.d.ts committed per repo convention)
- Minor (final-review triage): update() accepts all-whitespace name patching to empty string (plan-inherited)
- Minor (final-review triage): update audit records only name before/after for non-name edits (plan-inherited)

Task 5: complete (commits 27a82e3..520cfce, review clean; 42/42 verified by controller)
- Minor (final-review triage): order field duplicates possible after delete (plan-mandated order: existing.length)
- Minor (final-review triage): no direct tests for categories.remove CONFLICT path / rounds criteria cascade (plan-scoped gap)
- Minor (final-review triage): rounds.list N+1 criteria queries (plan-mandated, fine at config scale)

Task 6: complete (commits 520cfce..6f9a242, review clean; NOTE-mandated changePlan correction applied)
- Minor (final-review triage): criteria add audit logs untrimmed name (plan-mandated)
- Minor (final-review triage): criteria update audit records only weight before/after (plan-mandated)
- Minor (final-review triage): update/remove IDOR paths + update merged-validation untested (plan-scoped)

Task 7: complete (commits 6f9a242..adb1d6e, review clean, verbatim)
- Minor (final-review triage): contestants add accepts all-whitespace name (plan-inherited)
- Minor (final-review triage): contestants update audit before-snapshot only status (plan-inherited)

Task 8: complete (commits adb1d6e..f9c9d9a, review clean; test-helper deviation: ensureUserProfile for Bob - verified legit; NOTE-mandated corrected test applied)
- Minor (final-review triage): judge IDOR negative paths untested despite test title (plan-scoped)
- Minor (final-review triage): addAssignment audit omits criterionId (plan-inherited)

Task 9: complete (commits f9c9d9a..c724a36, review clean, verbatim)
- Minor (final-review triage): empty round fails both rounds.criteria and rounds.weights (co-occurring failures, plan design)

Task 10: complete (commits c724a36..cc66eb3, review clean; test-helper deviation: ensureUserProfile for Bob - same as Task 8)
- Minor (final-review triage): publish generates sheets via sequential inserts in triple loop (plan-mandated, scale consideration)

Task 11: complete (commits cc66eb3..2c745a7 impl + 6cc3253 fix, re-review clean; user-approved fix: dropped dead orgId===null clause)
- Minor (final-review triage): event-level scoringRules not captured in template snapshots (plan-acknowledged)
- Minor (final-review triage): templates.list unindexed filter scan for system templates (plan-mandated, scale note)

Task 12: complete (commits 6cc3253..06ce68b impl + 2c2a6cd fix, re-review clean; user-approved fix: grid loading/empty states; NOTE: controller failed to regen task-12 brief pre-dispatch - implementer regenerated correctly; user WIP in tree: app/graphify/, package.json graphify scripts, .graphifyignore - NEVER stage)
- Minor (final-review triage): overview Visibility card renders static 'See settings' stub + dead capitalize class (plan-mandated)
- Minor (final-review triage): EventShell 'return notFound()' vs bare call (plan-verbatim)

Task 13: complete (commits 2c2a6cd..7632b94 impl + 2ace183 fix, re-review clean; user-approved: typed Id select state (no as never) + per-judge roundPicks state; NOTE: user committed ad52efa docs Phase 3 spec mid-session - not ours)
- Minor (final-review triage): editors lack client-side empty-field guards (plan-mandated, server toasts backstop)
- Minor (final-review triage): selects lack aria-labels; inputs placeholder-only (plan-mandated)
- Minor (final-review triage): locked gating flashes edit controls while events.get loads (plan-mandated, server CONFLICT backstop)
- Minor (final-review triage): rounds/categories/contestants lists lack loading/empty messaging (plan-mandated)

Task 14: complete (commits 2ace183..927e831, review clean; deviation: run() param Promise<unknown> - brief's Promise<void> failed typecheck)
- Minor (final-review triage): readiness page empty ul while loading (plan-mandated)
- Minor (final-review triage): publish button briefly enabled while readiness loads (plan-mandated)
- Minor (final-review triage): settings Save ignores venue-only changes (plan-mandated)
- Minor (final-review triage): settings/templates inputs unlabeled (plan-mandated a11y)

Task 15: complete (controller-run: all 4 gates green, all 4 authz scans PASS - see task-15-report.md; smoke checklist left for human)

