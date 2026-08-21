# SDD Progress Ledger — certificate-editor

Branch: feat/certificate-editor (from eceebd7)
Plan: docs/superpowers/plans/2026-08-20-certificate-editor.md
Strategy: dependency-wave parallelism; implementers never touch git; controller commits per task after review.

## Waves
- Wave 1: T1 (fonts/deps), T2 (spec), T6 (geometry)
- Wave 2: T3 (schema/seed), T5 (tokens)
- Wave 3: T4 (CRUD/assets), T7 (snap), T9 (editorState)
- Wave 4: T8 (renderPdf), T10 (canvas), T11 (toolbar/palette), T12 (inspector), T14 (library page)
- Wave 5: T13 (editor shell/studio), T15 (generate dialog)
- Wave 6: T16 (e2e + gates)

## Completed tasks
(none yet)
Task 1: complete (15d6886, review clean; minors: pdfFontsPromise rejection poisoning, dev style re-injection, npm audit pre-existing)
Task 2: complete (0292c5b, review clean; minors: boundary-acceptance tests untested, TOKEN_PATTERN is stateful /g regex - later tasks must avoid .test()/.exec())
Task 6: complete (f42ebc6 + aspect fix, review clean; implementer corrected 4 provably-impossible plan assertions - reviewer independently verified all math)
Task 3: complete (4451d35, review clean; minor plan-mandated: seed doesn't re-validate spec before write - mitigated by compile-time constants + post-write test assertion)
Task 5: complete (dece2b8, review clean; minors: catalog test breadth, gates deferred to controller)
Task 4: complete (dbb041f + db0cbb4 typefix, review clean; hardening deviation adjudicated sound; minors: stringly permission param, silent 100-cap truncation, member-gated uploads)
Task 7: complete (2513236, review clean; 4 test corrections independently re-derived sound)
Task 9: complete (5c022f1, review clean; minors: multi-clone name collision, useEditorState init-arg semantics)
Task 8: complete (5047adb, review clean; minors: @react-pdf/types phantom dep - add devDependency at merge, renderToBlob removed in v4 - used pdf().toBlob())
Task 10: complete (41419d9 + capture fix, review clean after reviewer-prescribed fix; minors: none open)
Task 11: complete (3e325c3, review clean; minors: stale nameDraft on external rename, isDocumentSpec gate on Apply design)
Task 12: complete (343f492, review clean; minors: parseNumberInput dup, per-keystroke history entries, TokenPicker no outside-click close)
Task 14: complete (b20cd83, review clean; minors: (copy)(copy) naming, query error state unhandled)
Task 13: complete (51d822d, review clean; minors: overlapping-save baseline race self-heals, one comment nit)
Task 15: complete (2b64a66, review clean; minors: asset-URL Error toast, blank rank on partial results)
Task 16: complete (4c6a856, review clean; all gates green: typecheck, 333 tests, build 25/25 routes, e2e 8 pass/12 skip)
Final review: With fixes -> both Important fixes applied (autosave race, asset-error block); gates re-verified green
Follow-ups recorded: org asset registry + storage GC, undo coalescing, middle-mouse pan + true fit, drag e2e, deny-path permission test, remaining minor items
FOLLOW-UPS COMPLETE: 18 fixes in 2 waves (14+3+1 commits) - all review-approved; asset registry shipped (recordUpload/listByOrg/ownership assetUrls/GC + audit); gates: typecheck clean, 352/352 tests, build pass, e2e 8+2 new gated
