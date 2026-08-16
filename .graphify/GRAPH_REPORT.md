# Graph Report - .  (2026-08-16)

## Corpus Check
- Corpus is ~33,646 words - fits in a single context window. You may not need a graph.

## Summary
- 435 nodes · 893 edges · 26 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output
- Edge kinds: imports: 350 · contains: 326 · imports_from: 195 · calls: 22


## Input Scope
- Requested: auto
- Resolved: committed (source: cli)
- Included files: 113 · Candidates: 346
- Excluded: 20 untracked · 66303 ignored · 0 sensitive · 1 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.

## Graph Freshness
- Built from Git commit: `4e99062`
- Compare this hash to `git rev-parse HEAD` before trusting freshness-sensitive graph output.
## God Nodes (most connected - your core abstractions)
1. `api` - 28 edges
2. `Button()` - 26 edges
3. `Id` - 22 edges
4. `ErrorCode` - 19 edges
5. `appError()` - 19 edges
6. `cn()` - 17 edges
7. `writeAudit()` - 16 edges
8. `Doc` - 13 edges
9. `Input()` - 11 edges
10. `QueryCtx` - 11 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (22): OrgSwitcher(), UserMenu(), api, legend, contestantStatusLabel, ADVANCEMENT_MODES, BlackoutNotice(), ConfirmDialog() (+14 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (38): eventResults, finalizeEvent, listRoundVersions, roundResults, addAdvancementOverride, addTieBreak, closeRound, correctResults (+30 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (12): EventShell(), cn(), VersionBadge(), Badge(), badgeVariants, SelectContent(), SelectItem(), SelectTrigger() (+4 more)

### Community 3 - "Community 3"
Cohesion: 0.09
Nodes (11): geistMono, geistSans, metadata, Authenticated(), convex, ConvexClientProvider(), authClient, {
  handler,
  preloadAuthQuery,
  isAuthenticated,
  getToken,
  fetchAuthQuery,
  fetchAuthMutation,
  fetchAuthAction,
} (+3 more)

### Community 4 - "Community 4"
Cohesion: 0.12
Nodes (16): {
  create,
  findOne,
  findMany,
  updateOne,
  updateMany,
  deleteOne,
  deleteMany,
}, authComponent, createAuth(), createAuthOptions(), options, schema, tables, http (+8 more)

### Community 5 - "Community 5"
Cohesion: 0.16
Nodes (17): accept, create, getByToken, listForOrg, listForUser, revoke, Id, MutationCtx (+9 more)

### Community 6 - "Community 6"
Cohesion: 0.14
Nodes (15): add, advancementArgs, list, remove, update, myAssignments, saveDraft, sheetDetail (+7 more)

### Community 7 - "Community 7"
Cohesion: 0.15
Nodes (15): add, list, remove, update, add, list, remove, update (+7 more)

### Community 9 - "Community 9"
Cohesion: 0.14
Nodes (11): archive, publish, reopen, computeReadiness(), create, createFromTemplate, get, listByOrg (+3 more)

### Community 10 - "Community 10"
Cohesion: 0.16
Nodes (10): add, addAssignment, listWithAssignments, remove, removeAssignment, changePlan, getForOrg, AuditInput (+2 more)

### Community 11 - "Community 11"
Cohesion: 0.26
Nodes (12): formatScore(), RoundStatus, roundStatusLabel, roundStatusTone, SheetStatus, sheetStatusLabel, sheetStatusTone, tieResolvedByLabel (+4 more)

### Community 12 - "Community 12"
Cohesion: 0.23
Nodes (11): listByOrg, createFromEvent, list, remove, AuthCtx, loadPermissions(), requireOrgAdmin(), requireOrgMember() (+3 more)

### Community 13 - "Community 13"
Cohesion: 0.23
Nodes (5): Card(), CardContent(), CardDescription(), CardHeader(), CardTitle()

### Community 14 - "Community 14"
Cohesion: 0.26
Nodes (9): ensureUserProfile, getCurrentUser, seedReferenceData, seedReferenceDataInternal(), ROLE_PERMISSIONS, SYSTEM_PERMISSIONS, SYSTEM_PLANS, SYSTEM_ROLES (+1 more)

### Community 15 - "Community 15"
Cohesion: 0.26
Nodes (6): Dialog(), DialogContent(), DialogDescription(), DialogFooter(), DialogHeader(), DialogTitle()

### Community 16 - "Community 16"
Cohesion: 0.24
Nodes (7): create, get, listMine, update, requireIdentity(), requirePlatformOwner(), requireUserProfile()

### Community 17 - "Community 17"
Cohesion: 0.29
Nodes (4): add, remove, update, Doc

### Community 18 - "Community 18"
Cohesion: 0.50
Nodes (2): config, PROTECTED

### Community 19 - "Community 19"
Cohesion: 0.50
Nodes (2): MIME_TYPES, STUDIO_DIR

### Community 20 - "Community 20"
Cohesion: 1.00
Nodes (1): component

### Community 21 - "Community 21"
Cohesion: 1.00
Nodes (1): app

### Community 22 - "Community 22"
Cohesion: 1.00
Nodes (1): list

### Community 23 - "Community 23"
Cohesion: 1.00
Nodes (1): list

### Community 25 - "Community 25"
Cohesion: 1.00
Nodes (1): ComponentApi

### Community 26 - "Community 26"
Cohesion: 1.00
Nodes (1): nextConfig

### Community 28 - "Community 28"
Cohesion: 1.00
Nodes (1): config

## Knowledge Gaps
- **112 isolated node(s):** `legend`, `contestantStatusLabel`, `ADVANCEMENT_MODES`, `STUDIO_DIR`, `MIME_TYPES` (+107 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 18`** (2 nodes): `config`, `PROTECTED`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 19`** (2 nodes): `MIME_TYPES`, `STUDIO_DIR`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (1 nodes): `component`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (1 nodes): `app`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 22`** (1 nodes): `list`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (1 nodes): `list`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (1 nodes): `ComponentApi`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (1 nodes): `nextConfig`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (1 nodes): `config`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Id` connect `Community 5` to `Community 0`, `Community 14`, `Community 17`, `Community 9`, `Community 16`, `Community 1`, `Community 6`, `Community 4`, `Community 10`, `Community 12`?**
  _High betweenness centrality (0.395) - this node is a cross-community bridge._
- **Why does `api` connect `Community 0` to `Community 13`, `Community 3`, `Community 2`, `Community 4`?**
  _High betweenness centrality (0.154) - this node is a cross-community bridge._
- **Why does `cn()` connect `Community 2` to `Community 3`, `Community 0`, `Community 11`, `Community 13`, `Community 15`, `Community 8`?**
  _High betweenness centrality (0.084) - this node is a cross-community bridge._
- **What connects `legend`, `contestantStatusLabel`, `ADVANCEMENT_MODES` to the rest of the system?**
  _112 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.06811263318112633 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06183574879227053 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.06755260243632337 - nodes in this community are weakly interconnected._