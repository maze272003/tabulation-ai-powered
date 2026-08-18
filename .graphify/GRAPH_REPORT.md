# Graph Report - .  (2026-08-18)

## Corpus Check
- 212 files · ~90,091 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 907 nodes · 2469 edges · 60 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output
- Edge kinds: imports: 1141 · contains: 678 · imports_from: 553 · calls: 67 · method: 30


## Input Scope
- Requested: auto
- Resolved: committed (source: cli)
- Included files: 212 · Candidates: 684
- Excluded: 0 untracked · 68323 ignored · 2 sensitive · 0 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.

## Graph Freshness
- Built from Git commit: `c3cade0`
- Compare this hash to `git rev-parse HEAD` before trusting freshness-sensitive graph output.
## God Nodes (most connected - your core abstractions)
1. `api` - 53 edges
2. `Id` - 50 edges
3. `Button()` - 45 edges
4. `ErrorCode` - 37 edges
5. `appError()` - 37 edges
6. `cn()` - 36 edges
7. `Card()` - 30 edges
8. `writeAudit()` - 30 edges
9. `CardHeader()` - 29 edges
10. `CardTitle()` - 29 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities

### Community 0 - "Community 0"
Cohesion: 0.08
Nodes (31): appError(), AppErrorData, ErrorCode, generateSuperadminToken(), requireReason(), requireSuperadminSession(), resolveSuperadminCredentials(), create (+23 more)

### Community 1 - "Community 1"
Cohesion: 0.11
Nodes (19): EventShell(), STATUS_TONE, JudgeRoundItem, JudgeSheetItem, StaffRoundItem, cn(), legend, SheetDetailData (+11 more)

### Community 2 - "Community 2"
Cohesion: 0.11
Nodes (13): OrgSwitcher(), useDebouncedValue(), Avatar(), AvatarFallback(), AvatarImage(), DropdownMenu(), DropdownMenuContent(), DropdownMenuItem() (+5 more)

### Community 3 - "Community 3"
Cohesion: 0.13
Nodes (18): AccountItem, CredentialsData, STAGE_LABELS, STAGES, ReasonDialog(), BulkAccountsDialog(), ConfirmDialog(), errorData() (+10 more)

### Community 4 - "Community 4"
Cohesion: 0.08
Nodes (25): addAssignment, bulkCreate, bulkCreateAccounts, create, createAccount, deleteAccount, disable, enable (+17 more)

### Community 5 - "Community 5"
Cohesion: 0.19
Nodes (13): ALLOWED_NEXT_PREFIXES, LEAD_STAGE_LABELS, DatabaseResetCard(), PlatformBadge(), StatCard(), userStatusLabel, userStatusTone, TableSkeleton() (+5 more)

### Community 6 - "Community 6"
Cohesion: 0.09
Nodes (17): expireSubscriptions, ALL_TABLES, EVENT_TABLES, getDatabaseStats, resetAll, resetEvents, resetSingleEvent, MutationCtx (+9 more)

### Community 7 - "Community 7"
Cohesion: 0.09
Nodes (25): consumeExplanationQuota, eventResults, explain, explainContext, EXPLAINER_SYSTEM_INSTRUCTION, exportData, finalizeEvent, listRoundVersions (+17 more)

### Community 8 - "Community 8"
Cohesion: 0.14
Nodes (8): FEATURES, STEPS, PageHeader(), STATUS_TONE, AiEventWizardCard(), RoundAdvancement, Input(), Label()

### Community 9 - "Community 9"
Cohesion: 0.14
Nodes (15): STATUS_TONE, ConvexErrorBody, toastMutationError(), ADVANCEMENT_MODES, Num(), CategoryGroup, groupByCategory(), RoundResultsCard() (+7 more)

### Community 10 - "Community 10"
Cohesion: 0.12
Nodes (17): listActive, Id, QueryCtx, requireIdentity(), requirePlatformOwner(), requireUserProfile(), getUsage(), list (+9 more)

### Community 11 - "Community 11"
Cohesion: 0.12
Nodes (22): buildSnapshot(), loadRoundCompute(), RoundComputeResult, AdvancementConfig, AdvancementOverrideRow, applyAdvancement(), computeEventFinal(), computeRoundScore() (+14 more)

### Community 12 - "Community 12"
Cohesion: 0.15
Nodes (15): ChannelFilter, PlatformAuditPage(), scopeToOrgId(), ScopeValue, StatusFilter, BulkEntry, CreatedAccount, SelectItem() (+7 more)

### Community 13 - "Community 13"
Cohesion: 0.11
Nodes (18): add, list, remove, update, add, remove, update, add (+10 more)

### Community 14 - "Community 14"
Cohesion: 0.12
Nodes (17): getActiveCheckout, listForOrg, listByOrg, create, get, listMine, update, changePlan (+9 more)

### Community 15 - "Community 15"
Cohesion: 0.12
Nodes (11): geistMono, geistSans, metadata, AnnouncementBanner(), Authenticated(), convex, ConvexClientProvider(), authClient (+3 more)

### Community 16 - "Community 16"
Cohesion: 0.13
Nodes (10): LEAD_SOURCES, StageKey, STAGES, platformErrorMessage(), FEATURE_OPTIONS, LIMIT_OPTIONS, PlanEditorDialog(), PlanInput (+2 more)

### Community 17 - "Community 17"
Cohesion: 0.15
Nodes (13): SUBSCRIPTION_STATUSES, USAGE_RESOURCES, dateFormat, dateTimeFormat, formatDate(), formatDateTime(), OrgStatus, orgStatusLabel (+5 more)

### Community 18 - "Community 18"
Cohesion: 0.13
Nodes (5): LoadingScreen(), UserMenu(), api, NAV_ITEMS, NAV_ITEMS

### Community 19 - "Community 19"
Cohesion: 0.12
Nodes (13): archive, publish, reopen, computeReadiness(), create, createFromTemplate, get, listByOrg (+5 more)

### Community 20 - "Community 20"
Cohesion: 0.15
Nodes (13): eventResults, finalizeEvent, listRoundVersions, roundResults, myAssignments, saveDraft, sheetDetail, submitSheet (+5 more)

### Community 21 - "Community 21"
Cohesion: 0.15
Nodes (7): NAV_ITEMS, SentrySessionContext, SentrySessionProvider(), SentrySessionValue, SessionStatus, tokenListeners, useSentrySession()

### Community 22 - "Community 22"
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

### Community 23 - "Community 23"
Cohesion: 0.22
Nodes (15): CheckoutSessionInput, configuredPaymentMethodTypes(), createCheckoutSession(), DEFAULT_PAYMENT_METHOD_TYPES, expectedLivemode(), extractCheckoutUrl(), extractErrorMessage(), extractSessionId() (+7 more)

### Community 24 - "Community 24"
Cohesion: 0.19
Nodes (11): ensureUserProfile, getCurrentUser, seedE2EData, seedReferenceData, seedReferenceDataInternal(), ROLE_PERMISSIONS, SYSTEM_PERMISSIONS, SYSTEM_PLANS (+3 more)

### Community 25 - "Community 25"
Cohesion: 0.18
Nodes (8): EnterContext, EnterContextValue, EventSessionData, useEnterSession(), LEVEL_TONE, RoundIntegrityPanel(), contestantStatusLabel, BlackoutNotice()

### Community 26 - "Community 26"
Cohesion: 0.13
Nodes (12): addAdvancementOverride, addTieBreak, closeRound, correctResults, integrityReport, list, publishRound, removeAdvancementOverride (+4 more)

### Community 27 - "Community 27"
Cohesion: 0.19
Nodes (8): BillingContent(), formatDate(), formatPeso(), PAYMENT_STATUS_TONE, pesoFormat, PLAN_FEATURE_LABELS, formatMoney(), CardFooter()

### Community 28 - "Community 28"
Cohesion: 0.15
Nodes (11): cleanupExpiredSuperadminSessions, crons, clearFailureCounters, createSession, login, logout, lookupAccountForLogin, recordFailedAttempt (+3 more)

### Community 29 - "Community 29"
Cohesion: 0.20
Nodes (10): attachCheckoutSession, cancelCheckout, createCheckout, createPendingPayment, failPayment, computeRenewalWindow(), periodDurationMs(), randomHex() (+2 more)

### Community 30 - "Community 30"
Cohesion: 0.17
Nodes (11): addAdvancementOverride, addTieBreak, closeRound, correctResults, publishRound, removeAdvancementOverride, removeTieBreak, reopenRound (+3 more)

### Community 31 - "Community 31"
Cohesion: 0.21
Nodes (6): CsvCell, downloadTextFile(), toCsv(), FinalStandingRow, RoundResultTab, RoundStandingRow

### Community 32 - "Community 32"
Cohesion: 0.29
Nodes (11): averageRanks(), computeJudgeIntegrity(), IntegrityFlag, IntegrityFlagLevel, IntegrityMetricName, judgeContestantTotal(), JudgeIntegrityInput, JudgeIntegrityReport (+3 more)

### Community 33 - "Community 33"
Cohesion: 0.23
Nodes (10): buildTemplateDraft(), fail(), isRecord(), LlmCaller, num(), TemplateDraft, TemplateDraftConfig, validateTemplateDraft() (+2 more)

### Community 34 - "Community 34"
Cohesion: 0.17
Nodes (10): addNote, board, create, deleteLead, detail, LEAD_STAGES, leadStageValidator, linkOrg (+2 more)

### Community 35 - "Community 35"
Cohesion: 0.25
Nodes (10): applyPaidEvent(), applyTerminalEvent(), EXPIRY_EVENTS, extractEvent(), findPendingPayment(), flagPayment(), isRecord(), ProcessedEvent (+2 more)

### Community 36 - "Community 36"
Cohesion: 0.33
Nodes (8): formatScore(), RoundStatus, roundStatusLabel, roundStatusTone, sheetStatusLabel, sheetStatusTone, tieResolvedByLabel, Tone

### Community 37 - "Community 37"
Cohesion: 0.31
Nodes (7): ContestantCsvRow, CsvRowError, FileLine, parseContestantCsv(), splitCsvLine(), toNonBlankLines(), VALID_HEADERS_3

### Community 38 - "Community 38"
Cohesion: 0.46
Nodes (1): seedE2EDatabase()

### Community 39 - "Community 39"
Cohesion: 0.25
Nodes (1): JudgeSheetPage

### Community 40 - "Community 40"
Cohesion: 0.29
Nodes (1): SignInPage

### Community 41 - "Community 41"
Cohesion: 0.25
Nodes (1): StaffDashboardPage

### Community 42 - "Community 42"
Cohesion: 0.33
Nodes (5): DataModel, TableNames, ActionCtx, DatabaseReader, DatabaseWriter

### Community 43 - "Community 43"
Cohesion: 0.33
Nodes (1): EventWorkspacePage

### Community 44 - "Community 44"
Cohesion: 0.33
Nodes (1): JudgeWorkspacePage

### Community 45 - "Community 45"
Cohesion: 0.33
Nodes (1): LandingPage

### Community 46 - "Community 46"
Cohesion: 0.40
Nodes (3): resolveNextParam(), SignInForm(), metadata

### Community 47 - "Community 47"
Cohesion: 0.50
Nodes (3): get, computeEventResults(), latestVersion()

### Community 48 - "Community 48"
Cohesion: 0.50
Nodes (2): EnterAppShell(), metadata

### Community 49 - "Community 49"
Cohesion: 0.50
Nodes (2): config, PROTECTED

### Community 50 - "Community 50"
Cohesion: 0.50
Nodes (2): MIME_TYPES, STUDIO_DIR

### Community 51 - "Community 51"
Cohesion: 0.67
Nodes (3): dayKey(), emptyActivitySeries(), stats

### Community 52 - "Community 52"
Cohesion: 0.67
Nodes (1): SaveState

### Community 53 - "Community 53"
Cohesion: 1.00
Nodes (1): component

### Community 54 - "Community 54"
Cohesion: 1.00
Nodes (1): app

### Community 55 - "Community 55"
Cohesion: 1.00
Nodes (1): list

### Community 56 - "Community 56"
Cohesion: 1.00
Nodes (1): list

### Community 58 - "Community 58"
Cohesion: 1.00
Nodes (1): ComponentApi

### Community 59 - "Community 59"
Cohesion: 1.00
Nodes (1): nextConfig

### Community 61 - "Community 61"
Cohesion: 1.00
Nodes (1): config

## Knowledge Gaps
- **292 isolated node(s):** `pesoFormat`, `PAYMENT_STATUS_TONE`, `PLAN_FEATURE_LABELS`, `AccountItem`, `CredentialsData` (+287 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 38`** (1 nodes): `seedE2EDatabase()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (1 nodes): `JudgeSheetPage`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (1 nodes): `SignInPage`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (1 nodes): `StaffDashboardPage`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (1 nodes): `EventWorkspacePage`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (1 nodes): `JudgeWorkspacePage`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (1 nodes): `LandingPage`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (2 nodes): `EnterAppShell()`, `metadata`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (2 nodes): `config`, `PROTECTED`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (2 nodes): `MIME_TYPES`, `STUDIO_DIR`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (1 nodes): `SaveState`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (1 nodes): `component`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (1 nodes): `app`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 55`** (1 nodes): `list`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 56`** (1 nodes): `list`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 58`** (1 nodes): `ComponentApi`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 59`** (1 nodes): `nextConfig`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 61`** (1 nodes): `config`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Id` connect `Community 10` to `Community 3`, `Community 8`, `Community 12`, `Community 4`, `Community 24`, `Community 13`, `Community 19`, `Community 14`, `Community 6`, `Community 7`, `Community 30`, `Community 1`, `Community 25`, `Community 26`, `Community 20`, `Community 42`, `Community 11`, `Community 32`, `Community 17`, `Community 9`, `Community 31`, `Community 0`, `Community 34`, `Community 51`, `Community 5`, `Community 2`?**
  _High betweenness centrality (0.372) - this node is a cross-community bridge._
- **Why does `api` connect `Community 18` to `Community 3`, `Community 8`, `Community 12`, `Community 5`, `Community 27`, `Community 9`, `Community 15`, `Community 1`, `Community 2`, `Community 16`, `Community 25`, `Community 22`, `Community 38`, `Community 17`, `Community 31`, `Community 21`?**
  _High betweenness centrality (0.091) - this node is a cross-community bridge._
- **Why does `Doc` connect `Community 20` to `Community 35`, `Community 13`, `Community 28`, `Community 19`, `Community 14`, `Community 7`, `Community 26`, `Community 42`, `Community 10`, `Community 29`, `Community 24`, `Community 4`, `Community 11`, `Community 0`, `Community 33`, `Community 6`, `Community 16`, `Community 1`?**
  _High betweenness centrality (0.083) - this node is a cross-community bridge._
- **What connects `pesoFormat`, `PAYMENT_STATUS_TONE`, `PLAN_FEATURE_LABELS` to the rest of the system?**
  _292 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.07505285412262157 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.11379800853485064 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.1051693404634581 - nodes in this community are weakly interconnected._