# Graph Report - .  (2026-08-16)

## Corpus Check
- Corpus is ~39,875 words - fits in a single context window. You may not need a graph.

## Summary
- 504 nodes · 1200 edges · 25 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output
- Edge kinds: imports: 525 · contains: 377 · imports_from: 273 · calls: 25


## Input Scope
- Requested: auto
- Resolved: committed (source: cli)
- Included files: 131 · Candidates: 567
- Excluded: 1 untracked · 66575 ignored · 0 sensitive · 0 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.

## Graph Freshness
- Built from Git commit: `5eda360`
- Compare this hash to `git rev-parse HEAD` before trusting freshness-sensitive graph output.
## God Nodes (most connected - your core abstractions)
1. `api` - 33 edges
2. `Button()` - 31 edges
3. `Id` - 30 edges
4. `ErrorCode` - 22 edges
5. `appError()` - 22 edges
6. `writeAudit()` - 20 edges
7. `cn()` - 18 edges
8. `Input()` - 16 edges
9. `Doc` - 15 edges
10. `QueryCtx` - 14 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (42): PlatformAuditPage(), scopeToOrgId(), ScopeValue, StatusFilter, USAGE_RESOURCES, platformErrorMessage(), dateFormat, dateTimeFormat (+34 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (17): api, contestantStatusLabel, ADVANCEMENT_MODES, ConfirmDialog(), CategoryGroup, groupByCategory(), RoundResultsCard(), RoundSummary (+9 more)

### Community 2 - "Community 2"
Cohesion: 0.09
Nodes (27): EventShell(), cn(), legend, BlackoutNotice(), Num(), formatScore(), RoundStatus, roundStatusLabel (+19 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (38): eventResults, finalizeEvent, listRoundVersions, roundResults, addAdvancementOverride, addTieBreak, closeRound, correctResults (+30 more)

### Community 4 - "Community 4"
Cohesion: 0.12
Nodes (22): accept, create, getByToken, listForOrg, listForUser, revoke, Id, MutationCtx (+14 more)

### Community 5 - "Community 5"
Cohesion: 0.10
Nodes (11): geistMono, geistSans, metadata, Authenticated(), convex, ConvexClientProvider(), authClient, {
  handler,
  preloadAuthQuery,
  isAuthenticated,
  getToken,
  fetchAuthQuery,
  fetchAuthMutation,
  fetchAuthAction,
} (+3 more)

### Community 6 - "Community 6"
Cohesion: 0.11
Nodes (20): add, list, remove, update, add, addAssignment, listWithAssignments, remove (+12 more)

### Community 7 - "Community 7"
Cohesion: 0.14
Nodes (8): OrgSwitcher(), UserMenu(), StatCard(), Card(), CardContent(), CardDescription(), CardHeader(), CardTitle()

### Community 8 - "Community 8"
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

### Community 9 - "Community 9"
Cohesion: 0.14
Nodes (15): listByOrg, create, get, listMine, update, createFromEvent, list, remove (+7 more)

### Community 10 - "Community 10"
Cohesion: 0.13
Nodes (15): add, list, remove, update, changeRole, list, remove, add (+7 more)

### Community 11 - "Community 11"
Cohesion: 0.14
Nodes (11): Doc, requireIdentity(), requirePlatformOwner(), requireUserProfile(), list, stats, list, setPlan (+3 more)

### Community 12 - "Community 12"
Cohesion: 0.16
Nodes (8): add, remove, update, changePlan, getForOrg, AuditInput, writeAudit(), serialize()

### Community 13 - "Community 13"
Cohesion: 0.13
Nodes (6): DropdownMenu(), DropdownMenuContent(), DropdownMenuItem(), DropdownMenuLabel(), DropdownMenuSeparator(), DropdownMenuTrigger()

### Community 14 - "Community 14"
Cohesion: 0.14
Nodes (11): archive, publish, reopen, computeReadiness(), create, createFromTemplate, get, listByOrg (+3 more)

### Community 15 - "Community 15"
Cohesion: 0.23
Nodes (10): ensureUserProfile, getCurrentUser, seedReferenceData, seedReferenceDataInternal(), ROLE_PERMISSIONS, SYSTEM_PERMISSIONS, SYSTEM_PLANS, SYSTEM_ROLES (+2 more)

### Community 16 - "Community 16"
Cohesion: 0.50
Nodes (2): config, PROTECTED

### Community 17 - "Community 17"
Cohesion: 0.50
Nodes (2): MIME_TYPES, STUDIO_DIR

### Community 18 - "Community 18"
Cohesion: 1.00
Nodes (1): component

### Community 19 - "Community 19"
Cohesion: 1.00
Nodes (1): app

### Community 20 - "Community 20"
Cohesion: 1.00
Nodes (1): list

### Community 21 - "Community 21"
Cohesion: 1.00
Nodes (1): list

### Community 23 - "Community 23"
Cohesion: 1.00
Nodes (1): ComponentApi

### Community 24 - "Community 24"
Cohesion: 1.00
Nodes (1): nextConfig

### Community 26 - "Community 26"
Cohesion: 1.00
Nodes (1): config

## Knowledge Gaps
- **133 isolated node(s):** `legend`, `contestantStatusLabel`, `ADVANCEMENT_MODES`, `STUDIO_DIR`, `MIME_TYPES` (+128 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 16`** (2 nodes): `config`, `PROTECTED`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 17`** (2 nodes): `MIME_TYPES`, `STUDIO_DIR`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 18`** (1 nodes): `component`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 19`** (1 nodes): `app`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (1 nodes): `list`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (1 nodes): `list`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (1 nodes): `ComponentApi`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (1 nodes): `nextConfig`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (1 nodes): `config`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Id` connect `Community 4` to `Community 0`, `Community 1`, `Community 15`, `Community 12`, `Community 14`, `Community 9`, `Community 3`, `Community 6`, `Community 8`, `Community 2`, `Community 11`?**
  _High betweenness centrality (0.438) - this node is a cross-community bridge._
- **Why does `api` connect `Community 1` to `Community 7`, `Community 0`, `Community 5`, `Community 2`, `Community 8`?**
  _High betweenness centrality (0.141) - this node is a cross-community bridge._
- **Why does `Doc` connect `Community 11` to `Community 1`, `Community 12`, `Community 14`, `Community 9`, `Community 3`, `Community 6`, `Community 8`, `Community 15`, `Community 4`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **What connects `legend`, `contestantStatusLabel`, `ADVANCEMENT_MODES` to the rest of the system?**
  _133 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.07171171171171171 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.07393483709273183 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.09219858156028368 - nodes in this community are weakly interconnected._