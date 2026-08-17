# Graph Report - .  (2026-08-17)

## Corpus Check
- 202 files · ~83,182 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 838 nodes · 2299 edges · 50 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output
- Edge kinds: imports: 1075 · contains: 619 · imports_from: 528 · calls: 47 · method: 30


## Input Scope
- Requested: auto
- Resolved: committed (source: cli)
- Included files: 202 · Candidates: 665
- Excluded: 1 untracked · 67532 ignored · 2 sensitive · 0 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.

## Graph Freshness
- Built from Git commit: `32139eb`
- Compare this hash to `git rev-parse HEAD` before trusting freshness-sensitive graph output.
## God Nodes (most connected - your core abstractions)
1. `api` - 49 edges
2. `Button()` - 42 edges
3. `Id` - 42 edges
4. `cn()` - 36 edges
5. `ErrorCode` - 35 edges
6. `appError()` - 35 edges
7. `writeAudit()` - 30 edges
8. `Card()` - 28 edges
9. `CardHeader()` - 27 edges
10. `CardTitle()` - 27 edges

## Surprising Connections (you probably didn't know these)
- `Button()` --calls--> `buttonVariants`  [EXTRACTED]
  components/ui/button.tsx → components/ui/button.tsx  _Bridges community 0 → community 9_

## Communities

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (67): FEATURES, STEPS, ChannelFilter, PlatformAuditPage(), scopeToOrgId(), ScopeValue, ALLOWED_NEXT_PREFIXES, BillingContent() (+59 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (44): addAdvancementOverride, addTieBreak, closeRound, correctResults, publishRound, removeAdvancementOverride, removeTieBreak, reopenRound (+36 more)

### Community 2 - "Community 2"
Cohesion: 0.08
Nodes (31): appError(), AppErrorData, ErrorCode, generateSuperadminToken(), requireReason(), requireSuperadminSession(), resolveSuperadminCredentials(), create (+23 more)

### Community 3 - "Community 3"
Cohesion: 0.09
Nodes (24): listActive, eventResults, exportData, finalizeEvent, listRoundVersions, roundResults, Doc, Id (+16 more)

### Community 4 - "Community 4"
Cohesion: 0.09
Nodes (25): addAssignment, bulkCreate, bulkCreateAccounts, create, createAccount, deleteAccount, disable, enable (+17 more)

### Community 5 - "Community 5"
Cohesion: 0.08
Nodes (18): expireSubscriptions, ALL_TABLES, EVENT_TABLES, getDatabaseStats, resetAll, resetEvents, resetSingleEvent, MutationCtx (+10 more)

### Community 6 - "Community 6"
Cohesion: 0.13
Nodes (17): AccountItem, CredentialsData, ConvexErrorBody, toastMutationError(), FEATURE_OPTIONS, LIMIT_OPTIONS, PlanEditorDialog(), PlanInput (+9 more)

### Community 7 - "Community 7"
Cohesion: 0.10
Nodes (20): getActiveCheckout, listForOrg, listByOrg, create, get, listMine, update, changePlan (+12 more)

### Community 8 - "Community 8"
Cohesion: 0.11
Nodes (18): add, list, remove, update, add, remove, update, add (+10 more)

### Community 9 - "Community 9"
Cohesion: 0.12
Nodes (14): EnterAppShell(), EnterContext, EnterContextValue, EventSessionData, useEnterSession(), metadata, JudgeRoundItem, JudgeSheetItem (+6 more)

### Community 10 - "Community 10"
Cohesion: 0.18
Nodes (15): legend, Num(), formatScore(), RoundStatus, roundStatusLabel, roundStatusTone, SheetStatus, sheetStatusLabel (+7 more)

### Community 11 - "Community 11"
Cohesion: 0.17
Nodes (7): EventShell(), STATUS_TONE, LoadingScreen(), NAV_ITEMS, cn(), NAV_ITEMS, SentrySessionProvider()

### Community 12 - "Community 12"
Cohesion: 0.13
Nodes (10): geistMono, geistSans, metadata, AnnouncementBanner(), convex, ConvexClientProvider(), authClient, {
  handler,
  preloadAuthQuery,
  isAuthenticated,
  getToken,
  fetchAuthQuery,
  fetchAuthMutation,
  fetchAuthAction,
} (+2 more)

### Community 13 - "Community 13"
Cohesion: 0.18
Nodes (7): OrgSwitcher(), DropdownMenu(), DropdownMenuContent(), DropdownMenuItem(), DropdownMenuLabel(), DropdownMenuSeparator(), DropdownMenuTrigger()

### Community 14 - "Community 14"
Cohesion: 0.21
Nodes (10): STATUS_TONE, ADVANCEMENT_MODES, BulkEntry, CreatedAccount, Table(), TableBody(), TableCell(), TableHead() (+2 more)

### Community 15 - "Community 15"
Cohesion: 0.12
Nodes (13): archive, publish, reopen, computeReadiness(), create, createFromTemplate, get, listByOrg (+5 more)

### Community 16 - "Community 16"
Cohesion: 0.14
Nodes (12): eventResults, finalizeEvent, listRoundVersions, roundResults, myAssignments, saveDraft, sheetDetail, submitSheet (+4 more)

### Community 17 - "Community 17"
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

### Community 18 - "Community 18"
Cohesion: 0.21
Nodes (11): ensureUserProfile, getCurrentUser, seedE2EData, seedReferenceData, seedReferenceDataInternal(), ROLE_PERMISSIONS, SYSTEM_PERMISSIONS, SYSTEM_PLANS (+3 more)

### Community 19 - "Community 19"
Cohesion: 0.15
Nodes (11): cleanupExpiredSuperadminSessions, crons, clearFailureCounters, createSession, login, logout, lookupAccountForLogin, recordFailedAttempt (+3 more)

### Community 20 - "Community 20"
Cohesion: 0.28
Nodes (12): CheckoutSessionInput, createCheckoutSession(), extractCheckoutUrl(), extractErrorMessage(), extractSessionId(), hmacSha256Hex(), isRecord(), parseSignatureHeader() (+4 more)

### Community 21 - "Community 21"
Cohesion: 0.18
Nodes (9): attachCheckoutSession, cancelCheckout, createCheckout, createPendingPayment, failPayment, computeRenewalWindow(), randomHex(), RenewalSubscription (+1 more)

### Community 22 - "Community 22"
Cohesion: 0.23
Nodes (11): applyPaidEvent(), applyTerminalEvent(), EXPIRY_EVENTS, extractEvent(), findPendingPayment(), flagPayment(), isRecord(), ProcessedEvent (+3 more)

### Community 23 - "Community 23"
Cohesion: 0.21
Nodes (6): CsvCell, downloadTextFile(), toCsv(), FinalStandingRow, RoundResultTab, RoundStandingRow

### Community 24 - "Community 24"
Cohesion: 0.17
Nodes (10): addNote, board, create, deleteLead, detail, LEAD_STAGES, leadStageValidator, linkOrg (+2 more)

### Community 25 - "Community 25"
Cohesion: 0.24
Nodes (9): CategoryGroup, groupByCategory(), RoundResultsCard(), RoundSummary, StandingsRow, VersionBadge(), Tooltip(), TooltipContent() (+1 more)

### Community 26 - "Community 26"
Cohesion: 0.31
Nodes (7): ContestantCsvRow, CsvRowError, FileLine, parseContestantCsv(), splitCsvLine(), toNonBlankLines(), VALID_HEADERS_3

### Community 27 - "Community 27"
Cohesion: 0.29
Nodes (3): Authenticated(), UserMenu(), NAV_ITEMS

### Community 28 - "Community 28"
Cohesion: 0.25
Nodes (1): JudgeSheetPage

### Community 29 - "Community 29"
Cohesion: 0.29
Nodes (1): SignInPage

### Community 30 - "Community 30"
Cohesion: 0.25
Nodes (1): StaffDashboardPage

### Community 31 - "Community 31"
Cohesion: 0.52
Nodes (1): seedE2EDatabase()

### Community 32 - "Community 32"
Cohesion: 0.33
Nodes (5): DataModel, TableNames, ActionCtx, DatabaseReader, DatabaseWriter

### Community 33 - "Community 33"
Cohesion: 0.33
Nodes (3): contestantStatusLabel, BlackoutNotice(), ErrorState()

### Community 34 - "Community 34"
Cohesion: 0.29
Nodes (3): Avatar(), AvatarFallback(), AvatarImage()

### Community 35 - "Community 35"
Cohesion: 0.33
Nodes (1): EventWorkspacePage

### Community 36 - "Community 36"
Cohesion: 0.33
Nodes (1): JudgeWorkspacePage

### Community 37 - "Community 37"
Cohesion: 0.33
Nodes (1): LandingPage

### Community 38 - "Community 38"
Cohesion: 0.40
Nodes (3): resolveNextParam(), SignInForm(), metadata

### Community 39 - "Community 39"
Cohesion: 0.50
Nodes (2): config, PROTECTED

### Community 40 - "Community 40"
Cohesion: 0.50
Nodes (2): MIME_TYPES, STUDIO_DIR

### Community 41 - "Community 41"
Cohesion: 0.67
Nodes (3): dayKey(), emptyActivitySeries(), stats

### Community 42 - "Community 42"
Cohesion: 0.67
Nodes (1): SaveState

### Community 43 - "Community 43"
Cohesion: 1.00
Nodes (1): component

### Community 44 - "Community 44"
Cohesion: 1.00
Nodes (1): app

### Community 45 - "Community 45"
Cohesion: 1.00
Nodes (1): list

### Community 46 - "Community 46"
Cohesion: 1.00
Nodes (1): list

### Community 48 - "Community 48"
Cohesion: 1.00
Nodes (1): ComponentApi

### Community 51 - "Community 51"
Cohesion: 1.00
Nodes (1): nextConfig

### Community 53 - "Community 53"
Cohesion: 1.00
Nodes (1): config

## Knowledge Gaps
- **271 isolated node(s):** `pesoFormat`, `PAYMENT_STATUS_TONE`, `PLAN_FEATURE_LABELS`, `AccountItem`, `CredentialsData` (+266 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 28`** (1 nodes): `JudgeSheetPage`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (1 nodes): `SignInPage`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (1 nodes): `StaffDashboardPage`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (1 nodes): `seedE2EDatabase()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (1 nodes): `EventWorkspacePage`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (1 nodes): `JudgeWorkspacePage`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (1 nodes): `LandingPage`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (2 nodes): `config`, `PROTECTED`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (2 nodes): `MIME_TYPES`, `STUDIO_DIR`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (1 nodes): `SaveState`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (1 nodes): `component`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (1 nodes): `app`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (1 nodes): `list`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (1 nodes): `list`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (1 nodes): `ComponentApi`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (1 nodes): `nextConfig`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (1 nodes): `config`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Id` connect `Community 3` to `Community 6`, `Community 0`, `Community 4`, `Community 18`, `Community 8`, `Community 15`, `Community 7`, `Community 5`, `Community 1`, `Community 9`, `Community 16`, `Community 32`, `Community 10`, `Community 23`, `Community 33`, `Community 2`, `Community 24`, `Community 41`, `Community 25`?**
  _High betweenness centrality (0.352) - this node is a cross-community bridge._
- **Why does `api` connect `Community 0` to `Community 6`, `Community 12`, `Community 27`, `Community 11`, `Community 13`, `Community 14`, `Community 9`, `Community 17`, `Community 31`, `Community 49`, `Community 50`, `Community 10`, `Community 23`, `Community 33`, `Community 25`?**
  _High betweenness centrality (0.092) - this node is a cross-community bridge._
- **Why does `Doc` connect `Community 3` to `Community 22`, `Community 8`, `Community 19`, `Community 15`, `Community 7`, `Community 16`, `Community 32`, `Community 21`, `Community 18`, `Community 4`, `Community 1`, `Community 2`, `Community 5`, `Community 6`, `Community 9`?**
  _High betweenness centrality (0.090) - this node is a cross-community bridge._
- **What connects `pesoFormat`, `PAYMENT_STATUS_TONE`, `PLAN_FEATURE_LABELS` to the rest of the system?**
  _271 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05413870246085011 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05551020408163265 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.07505285412262157 - nodes in this community are weakly interconnected._