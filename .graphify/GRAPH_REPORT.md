# Graph Report - .  (2026-08-16)

## Corpus Check
- 140 files · ~50,037 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 556 nodes · 1383 edges · 26 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output
- Edge kinds: imports: 629 · contains: 423 · imports_from: 305 · calls: 26


## Input Scope
- Requested: auto
- Resolved: committed (source: cli)
- Included files: 140 · Candidates: 584
- Excluded: 0 untracked · 66272 ignored · 2 sensitive · 0 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.

## Graph Freshness
- Built from Git commit: `886c48b`
- Compare this hash to `git rev-parse HEAD` before trusting freshness-sensitive graph output.
## God Nodes (most connected - your core abstractions)
1. `api` - 34 edges
2. `Id` - 32 edges
3. `Button()` - 30 edges
4. `ErrorCode` - 24 edges
5. `appError()` - 24 edges
6. `cn()` - 24 edges
7. `writeAudit()` - 20 edges
8. `Doc` - 19 edges
9. `QueryCtx` - 18 edges
10. `Input()` - 17 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (37): AccountItem, OrgSwitcher(), UserMenu(), EnterContext, EnterContextValue, EventSessionData, useEnterSession(), JudgeRoundItem (+29 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (41): PlatformAuditPage(), scopeToOrgId(), ScopeValue, StatusFilter, platformErrorMessage(), dateFormat, dateTimeFormat, formatDate() (+33 more)

### Community 2 - "Community 2"
Cohesion: 0.08
Nodes (33): EventShell(), cn(), legend, BlackoutNotice(), Num(), CategoryGroup, groupByCategory(), RoundResultsCard() (+25 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (46): addAdvancementOverride, addTieBreak, closeRound, correctResults, publishRound, removeAdvancementOverride, removeTieBreak, reopenRound (+38 more)

### Community 4 - "Community 4"
Cohesion: 0.08
Nodes (23): {
  create,
  findOne,
  findMany,
  updateOne,
  updateMany,
  deleteOne,
  deleteMany,
}, authComponent, createAuth(), createAuthOptions(), options, schema, tables, clearFailureCounters (+15 more)

### Community 5 - "Community 5"
Cohesion: 0.11
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
Cohesion: 0.09
Nodes (19): add, list, remove, update, eventResults, finalizeEvent, listRoundVersions, roundResults (+11 more)

### Community 7 - "Community 7"
Cohesion: 0.14
Nodes (17): Id, QueryCtx, getPlan(), getSubscription(), hasFeature(), hasLimit(), limitKeyForResource(), requireFeature() (+9 more)

### Community 8 - "Community 8"
Cohesion: 0.13
Nodes (14): add, list, remove, update, add, remove, update, archive (+6 more)

### Community 9 - "Community 9"
Cohesion: 0.14
Nodes (12): eventResults, finalizeEvent, listRoundVersions, roundResults, myAssignments, saveDraft, sheetDetail, submitSheet (+4 more)

### Community 10 - "Community 10"
Cohesion: 0.15
Nodes (9): changePlan, getForOrg, MutationCtx, AuditInput, writeAudit(), serialize(), list, setPlatformRole (+1 more)

### Community 11 - "Community 11"
Cohesion: 0.22
Nodes (12): listByOrg, createFromEvent, list, remove, AuthCtx, loadPermissions(), requireOrgAdmin(), requireOrgMember() (+4 more)

### Community 12 - "Community 12"
Cohesion: 0.18
Nodes (10): create, get, listMine, update, Doc, requireIdentity(), requirePlatformOwner(), requireUserProfile() (+2 more)

### Community 13 - "Community 13"
Cohesion: 0.14
Nodes (10): addAssignment, create, createAccount, deleteAccount, disable, enable, list, removeAssignment (+2 more)

### Community 14 - "Community 14"
Cohesion: 0.15
Nodes (9): create, createFromTemplate, get, listByOrg, readiness, ReadinessCheck, regenerateCode, update (+1 more)

### Community 15 - "Community 15"
Cohesion: 0.23
Nodes (10): ensureUserProfile, getCurrentUser, seedReferenceData, seedReferenceDataInternal(), ROLE_PERMISSIONS, SYSTEM_PERMISSIONS, SYSTEM_PLANS, SYSTEM_ROLES (+2 more)

### Community 16 - "Community 16"
Cohesion: 0.50
Nodes (2): EnterAppShell(), metadata

### Community 17 - "Community 17"
Cohesion: 0.50
Nodes (2): config, PROTECTED

### Community 18 - "Community 18"
Cohesion: 0.50
Nodes (2): MIME_TYPES, STUDIO_DIR

### Community 19 - "Community 19"
Cohesion: 1.00
Nodes (1): component

### Community 20 - "Community 20"
Cohesion: 1.00
Nodes (1): app

### Community 21 - "Community 21"
Cohesion: 1.00
Nodes (1): list

### Community 22 - "Community 22"
Cohesion: 1.00
Nodes (1): list

### Community 24 - "Community 24"
Cohesion: 1.00
Nodes (1): ComponentApi

### Community 25 - "Community 25"
Cohesion: 1.00
Nodes (1): nextConfig

### Community 27 - "Community 27"
Cohesion: 1.00
Nodes (1): config

## Knowledge Gaps
- **166 isolated node(s):** `AccountItem`, `legend`, `contestantStatusLabel`, `ADVANCEMENT_MODES`, `metadata` (+161 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 16`** (2 nodes): `EnterAppShell()`, `metadata`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 17`** (2 nodes): `config`, `PROTECTED`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 18`** (2 nodes): `MIME_TYPES`, `STUDIO_DIR`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 19`** (1 nodes): `component`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (1 nodes): `app`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (1 nodes): `list`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 22`** (1 nodes): `list`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (1 nodes): `ComponentApi`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (1 nodes): `nextConfig`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (1 nodes): `config`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Id` connect `Community 7` to `Community 0`, `Community 1`, `Community 13`, `Community 15`, `Community 8`, `Community 14`, `Community 12`, `Community 3`, `Community 9`, `Community 4`, `Community 10`, `Community 11`, `Community 2`?**
  _High betweenness centrality (0.424) - this node is a cross-community bridge._
- **Why does `api` connect `Community 0` to `Community 1`, `Community 5`, `Community 2`, `Community 4`?**
  _High betweenness centrality (0.114) - this node is a cross-community bridge._
- **Why does `Doc` connect `Community 12` to `Community 8`, `Community 14`, `Community 6`, `Community 9`, `Community 4`, `Community 11`, `Community 15`, `Community 7`, `Community 3`, `Community 10`, `Community 0`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **What connects `AccountItem`, `legend`, `contestantStatusLabel` to the rest of the system?**
  _166 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05317703024125042 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.0609009009009009 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.07826694619147449 - nodes in this community are weakly interconnected._