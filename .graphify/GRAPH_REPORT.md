# Graph Report - .  (2026-08-17)

## Corpus Check
- 198 files · ~80,800 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 821 nodes · 2234 edges · 47 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output
- Edge kinds: imports: 1038 · contains: 606 · imports_from: 513 · calls: 47 · method: 30


## Input Scope
- Requested: auto
- Resolved: committed (source: cli)
- Included files: 198 · Candidates: 658
- Excluded: 1 untracked · 67354 ignored · 2 sensitive · 0 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.

## Graph Freshness
- Built from Git commit: `aeeaf4b`
- Compare this hash to `git rev-parse HEAD` before trusting freshness-sensitive graph output.
## God Nodes (most connected - your core abstractions)
1. `api` - 47 edges
2. `Id` - 42 edges
3. `Button()` - 40 edges
4. `cn()` - 36 edges
5. `ErrorCode` - 35 edges
6. `appError()` - 35 edges
7. `writeAudit()` - 30 edges
8. `Card()` - 28 edges
9. `CardHeader()` - 27 edges
10. `CardTitle()` - 27 edges

## Surprising Connections (you probably didn't know these)
- `computeEventResults()` --calls--> `latestVersion()`  [EXTRACTED]
  convex/lib/eventResults.ts → convex/lib/eventResults.ts  _Bridges community 12 → community 2_
- `Button()` --calls--> `buttonVariants`  [EXTRACTED]
  components/ui/button.tsx → components/ui/button.tsx  _Bridges community 0 → community 1_

## Communities

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (77): FEATURES, STEPS, ChannelFilter, PlatformAuditPage(), scopeToOrgId(), ScopeValue, ALLOWED_NEXT_PREFIXES, BillingContent() (+69 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (53): AccountItem, CredentialsData, EnterAppShell(), EnterContext, EnterContextValue, EventSessionData, useEnterSession(), metadata (+45 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (45): addAdvancementOverride, addTieBreak, closeRound, correctResults, publishRound, removeAdvancementOverride, removeTieBreak, reopenRound (+37 more)

### Community 3 - "Community 3"
Cohesion: 0.09
Nodes (27): appError(), AppErrorData, ErrorCode, generateSuperadminToken(), requireReason(), requireSuperadminSession(), resolveSuperadminCredentials(), create (+19 more)

### Community 4 - "Community 4"
Cohesion: 0.10
Nodes (20): getActiveCheckout, listForOrg, listByOrg, create, get, listMine, update, changePlan (+12 more)

### Community 5 - "Community 5"
Cohesion: 0.09
Nodes (22): addAssignment, create, createAccount, deleteAccount, disable, enable, list, removeAssignment (+14 more)

### Community 6 - "Community 6"
Cohesion: 0.10
Nodes (19): ALL_TABLES, EVENT_TABLES, getDatabaseStats, resetAll, resetEvents, resetSingleEvent, Id, QueryCtx (+11 more)

### Community 7 - "Community 7"
Cohesion: 0.11
Nodes (19): add, list, remove, update, eventResults, finalizeEvent, listRoundVersions, roundResults (+11 more)

### Community 8 - "Community 8"
Cohesion: 0.12
Nodes (12): expireSubscriptions, MutationCtx, AuditInput, writeAudit(), serialize(), list, setPlatformRole, setStatus (+4 more)

### Community 9 - "Community 9"
Cohesion: 0.17
Nodes (7): EventShell(), STATUS_TONE, LoadingScreen(), NAV_ITEMS, cn(), NAV_ITEMS, SentrySessionProvider()

### Community 10 - "Community 10"
Cohesion: 0.18
Nodes (7): OrgSwitcher(), DropdownMenu(), DropdownMenuContent(), DropdownMenuItem(), DropdownMenuLabel(), DropdownMenuSeparator(), DropdownMenuTrigger()

### Community 11 - "Community 11"
Cohesion: 0.12
Nodes (13): archive, publish, reopen, computeReadiness(), create, createFromTemplate, get, listByOrg (+5 more)

### Community 12 - "Community 12"
Cohesion: 0.13
Nodes (13): eventResults, finalizeEvent, listRoundVersions, roundResults, myAssignments, saveDraft, sheetDetail, submitSheet (+5 more)

### Community 13 - "Community 13"
Cohesion: 0.14
Nodes (9): geistMono, geistSans, metadata, AnnouncementBanner(), convex, ConvexClientProvider(), authClient, {
  handler,
  preloadAuthQuery,
  isAuthenticated,
  getToken,
  fetchAuthQuery,
  fetchAuthMutation,
  fetchAuthAction,
} (+1 more)

### Community 14 - "Community 14"
Cohesion: 0.18
Nodes (11): {
  create,
  findOne,
  findMany,
  updateOne,
  updateMany,
  deleteOne,
  deleteMany,
}, authComponent, createAuth(), createAuthOptions(), options, schema, tables, paymongoWebhook (+3 more)

### Community 15 - "Community 15"
Cohesion: 0.18
Nodes (9): listActive, Doc, requireIdentity(), requirePlatformOwner(), requireUserProfile(), list, stats, list (+1 more)

### Community 16 - "Community 16"
Cohesion: 0.21
Nodes (11): ensureUserProfile, getCurrentUser, seedE2EData, seedReferenceData, seedReferenceDataInternal(), ROLE_PERMISSIONS, SYSTEM_PERMISSIONS, SYSTEM_PLANS (+3 more)

### Community 17 - "Community 17"
Cohesion: 0.15
Nodes (11): cleanupExpiredSuperadminSessions, crons, clearFailureCounters, createSession, login, logout, lookupAccountForLogin, recordFailedAttempt (+3 more)

### Community 18 - "Community 18"
Cohesion: 0.28
Nodes (12): CheckoutSessionInput, createCheckoutSession(), extractCheckoutUrl(), extractErrorMessage(), extractSessionId(), hmacSha256Hex(), isRecord(), parseSignatureHeader() (+4 more)

### Community 19 - "Community 19"
Cohesion: 0.18
Nodes (9): attachCheckoutSession, cancelCheckout, createCheckout, createPendingPayment, failPayment, computeRenewalWindow(), randomHex(), RenewalSubscription (+1 more)

### Community 20 - "Community 20"
Cohesion: 0.23
Nodes (11): applyPaidEvent(), applyTerminalEvent(), EXPIRY_EVENTS, extractEvent(), findPendingPayment(), flagPayment(), isRecord(), ProcessedEvent (+3 more)

### Community 21 - "Community 21"
Cohesion: 0.17
Nodes (10): addNote, board, create, deleteLead, detail, LEAD_STAGES, leadStageValidator, linkOrg (+2 more)

### Community 22 - "Community 22"
Cohesion: 0.31
Nodes (7): ContestantCsvRow, CsvRowError, FileLine, parseContestantCsv(), splitCsvLine(), toNonBlankLines(), VALID_HEADERS_3

### Community 23 - "Community 23"
Cohesion: 0.29
Nodes (3): Authenticated(), UserMenu(), NAV_ITEMS

### Community 24 - "Community 24"
Cohesion: 0.25
Nodes (1): JudgeSheetPage

### Community 25 - "Community 25"
Cohesion: 0.29
Nodes (1): SignInPage

### Community 26 - "Community 26"
Cohesion: 0.25
Nodes (1): StaffDashboardPage

### Community 27 - "Community 27"
Cohesion: 0.52
Nodes (1): seedE2EDatabase()

### Community 28 - "Community 28"
Cohesion: 0.33
Nodes (5): DataModel, TableNames, ActionCtx, DatabaseReader, DatabaseWriter

### Community 29 - "Community 29"
Cohesion: 0.43
Nodes (5): VersionBadge(), Tooltip(), TooltipContent(), TooltipProvider(), TooltipTrigger()

### Community 30 - "Community 30"
Cohesion: 0.29
Nodes (3): Avatar(), AvatarFallback(), AvatarImage()

### Community 31 - "Community 31"
Cohesion: 0.33
Nodes (3): add, remove, update

### Community 32 - "Community 32"
Cohesion: 0.33
Nodes (1): EventWorkspacePage

### Community 33 - "Community 33"
Cohesion: 0.33
Nodes (1): JudgeWorkspacePage

### Community 34 - "Community 34"
Cohesion: 0.33
Nodes (1): LandingPage

### Community 35 - "Community 35"
Cohesion: 0.40
Nodes (3): resolveNextParam(), SignInForm(), metadata

### Community 36 - "Community 36"
Cohesion: 0.50
Nodes (2): config, PROTECTED

### Community 37 - "Community 37"
Cohesion: 0.50
Nodes (2): MIME_TYPES, STUDIO_DIR

### Community 38 - "Community 38"
Cohesion: 0.67
Nodes (3): dayKey(), emptyActivitySeries(), stats

### Community 39 - "Community 39"
Cohesion: 0.67
Nodes (1): SaveState

### Community 40 - "Community 40"
Cohesion: 1.00
Nodes (1): component

### Community 41 - "Community 41"
Cohesion: 1.00
Nodes (1): app

### Community 42 - "Community 42"
Cohesion: 1.00
Nodes (1): list

### Community 43 - "Community 43"
Cohesion: 1.00
Nodes (1): list

### Community 45 - "Community 45"
Cohesion: 1.00
Nodes (1): ComponentApi

### Community 48 - "Community 48"
Cohesion: 1.00
Nodes (1): nextConfig

### Community 50 - "Community 50"
Cohesion: 1.00
Nodes (1): config

## Knowledge Gaps
- **265 isolated node(s):** `pesoFormat`, `PAYMENT_STATUS_TONE`, `PLAN_FEATURE_LABELS`, `AccountItem`, `CredentialsData` (+260 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 24`** (1 nodes): `JudgeSheetPage`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (1 nodes): `SignInPage`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (1 nodes): `StaffDashboardPage`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (1 nodes): `seedE2EDatabase()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 32`** (1 nodes): `EventWorkspacePage`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (1 nodes): `JudgeWorkspacePage`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (1 nodes): `LandingPage`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (2 nodes): `config`, `PROTECTED`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (2 nodes): `MIME_TYPES`, `STUDIO_DIR`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (1 nodes): `SaveState`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (1 nodes): `component`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (1 nodes): `app`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (1 nodes): `list`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (1 nodes): `list`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (1 nodes): `ComponentApi`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (1 nodes): `nextConfig`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (1 nodes): `config`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Id` connect `Community 6` to `Community 1`, `Community 0`, `Community 5`, `Community 16`, `Community 31`, `Community 11`, `Community 4`, `Community 2`, `Community 12`, `Community 28`, `Community 8`, `Community 7`, `Community 15`, `Community 3`, `Community 21`, `Community 38`?**
  _High betweenness centrality (0.343) - this node is a cross-community bridge._
- **Why does `Doc` connect `Community 15` to `Community 20`, `Community 31`, `Community 17`, `Community 11`, `Community 4`, `Community 7`, `Community 12`, `Community 28`, `Community 19`, `Community 16`, `Community 5`, `Community 2`, `Community 3`, `Community 8`, `Community 1`?**
  _High betweenness centrality (0.089) - this node is a cross-community bridge._
- **Why does `api` connect `Community 0` to `Community 1`, `Community 13`, `Community 23`, `Community 9`, `Community 10`, `Community 14`, `Community 27`, `Community 46`, `Community 47`?**
  _High betweenness centrality (0.087) - this node is a cross-community bridge._
- **What connects `pesoFormat`, `PAYMENT_STATUS_TONE`, `PLAN_FEATURE_LABELS` to the rest of the system?**
  _265 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05011405759908754 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05030643513789581 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.05656108597285068 - nodes in this community are weakly interconnected._