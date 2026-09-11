# Judge Digital Signature & Scrutineer Certification Suite Design

## 1. Overview & Problem Statement

In competitive judging events (pageants, dance championships, talent competitions, cheer, gymnastics, culinary competitions), the integrity and credibility of results depend on verified human accountability. Prior to this feature, rounds auto-closed when all score sheets were submitted, allowing staff to publish standings without:
1. **Judge Confirmation**: Judges could not review their complete round scores or affirm that entered numbers accurately reflect their judging intent.
2. **Legal & Audit Sign-Off**: No digital signatures or impartiality affirmations were captured to prevent repudiation or unauthorized score tampering.
3. **Scrutineer Verification Gate**: Staff had no systematic verification matrix to ensure all judges were accounted for, no emergency paper backup capture, and no formal countersignature before publication.
4. **Tamper-Proof Audit Records**: Printed standings and certificates lacked verifiable cryptographic links to the original signed score sheets.

This feature introduces an end-to-end digital certification ecosystem:
- **Upfront Specimen Registration**: Mandatory first-login signature onboarding for judges and staff.
- **One-Tap Round Certification**: Clear round scorecard summary with one-tap digital signature authorization and optional penalty/deduction remarks.
- **Tamper-Evident Stale Invalidation**: Server-computed score hash digests that instantly invalidate signatures if scores change.
- **Scrutineer Command Matrix**: Live real-time certification grid, remote judge nudges, paper-backup photo attachments for emergency overrides, and required Scrutineer countersigning before publishing.
- **Public Verifiable Audit Sheets**: High-DPI printable Tabulation Audit Sheets with all affixed signatures and a public QR code verification landing page.

---

## 2. Architecture & Data Model

### 2.1 Schema Extensions (`convex/schema.ts`)

#### Extensions to `eventAccounts` and `userProfiles`
```ts
// eventAccounts
signatureSpecimen: v.optional(v.string()), // Normalized SVG vector path data
signatureType: v.optional(v.union(v.literal("drawn"), v.literal("typed"), v.literal("uploaded"))),
signatureRegisteredAt: v.optional(v.number()),
titleOrAffiliation: v.optional(v.string()),

// userProfiles (for staff/scrutineers logged in via platform accounts)
signatureSpecimen: v.optional(v.string()),
signatureType: v.optional(v.union(v.literal("drawn"), v.literal("typed"), v.literal("uploaded"))),
signatureRegisteredAt: v.optional(v.number()),
titleOrAffiliation: v.optional(v.string()),
```

#### New Table: `roundSignatures`
Tracks individual digital signatures and certifications per round or overall event scope.
```ts
roundSignatures: defineTable({
  eventId: v.id("events"),
  scope: v.union(v.literal("round"), v.literal("event_final")),
  roundId: v.optional(v.id("rounds")),
  actorType: v.union(v.literal("eventAccount"), v.literal("userProfile")),
  actorId: v.string(), // Id<"eventAccounts"> | Id<"userProfiles">
  displayName: v.string(),
  titleOrAffiliation: v.optional(v.string()),
  role: v.union(v.literal("judge"), v.literal("head_judge"), v.literal("scrutineer")),
  svgPath: v.string(), // Vector signature paths
  signatureType: v.union(v.literal("drawn"), v.literal("typed"), v.literal("uploaded")),
  signedAt: v.number(),
  scoresHash: v.string(), // Server-computed deterministic SHA-256 digest of judge's scores
  judgeNotes: v.optional(v.string()),
  status: v.union(v.literal("valid"), v.literal("stale"), v.literal("superseded"), v.literal("overridden")),
  overrideReason: v.optional(v.string()),
  overrideAttachmentStorageId: v.optional(v.string()), // Photo of physical paper sheet if overridden
  overriddenBy: v.optional(v.string()),
})
  .index("by_round_id", ["roundId"])
  .index("by_event_id_and_scope", ["eventId", "scope"])
  .index("by_round_and_actor", ["roundId", "actorId"]),
```

#### Snapshot Extension: `resultVersions.snapshot`
Preserves immutable verification records inside published results:
```ts
certifications: v.optional(v.array(v.object({
  actorId: v.string(),
  displayName: v.string(),
  titleOrAffiliation: v.optional(v.string()),
  role: v.union(v.literal("judge"), v.literal("head_judge"), v.literal("scrutineer")),
  svgPath: v.string(),
  signatureType: v.union(v.literal("drawn"), v.literal("typed"), v.literal("uploaded")),
  signedAt: v.number(),
  scoresHash: v.string(),
  judgeNotes: v.optional(v.string()),
  isOverride: v.boolean(),
  overrideReason: v.optional(v.string()),
  overrideAttachmentStorageId: v.optional(v.string()),
}))),
verificationHash: v.optional(v.string()), // Merkle root hash linking scores, versions, and signatures
```

---

## 3. Core Workflows & Logic

### 3.1 First-Login Signature Onboarding (`<JudgeSignatureGate />`)
1. When any judge or staff user enters an event portal (`/enter/...`), the application inspects their account record.
2. If `signatureSpecimen` is missing, the navigation is intercepted by a non-dismissible onboarding dialog.
3. The user has 3 input options:
   - **Draw**: High-precision HTML5 canvas with Catmull-Rom cubic bezier smoothing and pressure simulation.
   - **Type**: Input legal name; preview rendered using elegant script calligraphy styles.
   - **Upload**: Upload existing clean PNG/SVG image.
4. User confirms legal name, optional title/affiliation, and checks the **Oath of Impartiality**.
5. Server saves `signatureSpecimen` to `eventAccounts` or `userProfiles` via `registerSignatureSpecimen`. Onboarding completes in under 15 seconds.

### 3.2 Judge Round Summary & 1-Tap Authorization
1. When all score sheets in a round are submitted by a judge, the judge interface renders the **Round Scorecard Summary**.
2. Displays all contestants scored by this judge, individual criterion marks, total calculated points, and relative rank ordering.
3. Displays the **Certification Card**:
   - Preview of registered signature specimen.
   - Certification affirmation text: *"I hereby certify that the scores above are my independent, honest, and final evaluation for this round."*
   - Optional **Deduction & Notes** input field.
   - Primary action: **[Affirm & Sign Round]**.
   - Secondary action: **[Draw Custom Signature for this Round]** (optional variation).
4. On submission, the server computes the deterministic `scoresHash`:
   $$\text{scoresHash} = \text{SHA-256}(\text{sorted(judgeScoresForRound)})$$
   Stores the record in `roundSignatures` with status `valid`.

### 3.3 Scrutineer Command Center & Gated Publication
1. In the Staff Round Review page (`/enter/round/[roundId]`), a new **Judges Certification Matrix** renders:
   - Real-time reactive status per judge:
     - 🟢 **Signed & Verified**: Shows preview of signature, timestamp, and score hash.
     - 🟡 **Pending Signature**: All sheets submitted, awaiting 1-tap sign-off (with 1-click **Nudge** button).
     - 🔴 **Incomplete Sheets**: Scoring still in progress.
     - ⚠️ **Stale Signature**: Detected score modification after signature.
     - 🛡️ **Emergency Override**: Audited override with optional camera upload of physical paper sheet.
2. **Emergency Override Protocol**:
   - If a judge device fails, staff selects "Emergency Override".
   - Staff enters mandatory justification (minimum 10 characters) and snaps a photo of the physical paper scorecard.
   - Photo is saved in Convex storage (`overrideAttachmentStorageId`).
3. **Scrutineer Countersigning**:
   - Once 100% of assigned judges are 🟢 Signed or 🛡️ Overridden, the **Scrutineer Countersign** card activates.
   - The Head Scrutineer signs using their saved specimen or fresh signature pad.
4. **Publishing**:
   - `publishRound` mutation verifies that every assigned judge and the scrutineer have valid certifications.
   - Bakes all signatures, notes, and the combined `verificationHash` into `resultVersions.snapshot`.

### 3.4 Cryptographic Verification & Public Proof Page
1. **Root Verification Hash**:
   $$\text{verificationHash} = \text{SHA-256}(\text{roundId} + \text{snapshot.computedAt} + \text{standingsJSON} + \text{signaturesJSON})$$
2. **Public Verification Route** (`/verify/[verificationHash]`):
   - Accessible publicly without authentication.
   - Shows event name, organization branding, official round name, publication timestamp.
   - Lists verified panel of adjudicators and scrutineer with verified checkmarks and timestamps.
   - Confirms: *"Cryptographically Verified & Authentic Official Record"*.

### 3.5 Official Printable Tabulation Audit Sheet
- Located at `/enter/round/[roundId]/audit-sheet`.
- Styled with strict `@media print` CSS for 300+ DPI paper printing or instant PDF export.
- Features:
  - Clean executive header with event title, round name, and official date.
  - Master standings table and detailed judge scoring matrix.
  - Verification QR Code pointing directly to `/verify/[verificationHash]`.
  - Formal signature blocks at bottom displaying all judge and scrutineer signatures with names, titles, and verification timestamps.

---

## 4. Frontend Component Structure

```
components/
└── signatures/
    ├── SignaturePad.tsx            // Reusable HTML5 bezier canvas & SVG vector generator (Draw/Type/Upload)
    ├── JudgeSignatureGate.tsx      // Non-dismissible first-login onboarding modal
    ├── JudgeRoundSummaryModal.tsx  // Scorecard table review & 1-tap authorization card
    ├── ScrutineerSignOffCard.tsx   // Staff matrix, nudge button, override modal, countersign block
    └── VerificationBadge.tsx       // Status badges (Signed, Stale, Pending, Overridden)
```

Routes:
- `/enter/round/[roundId]/audit-sheet`: Print-optimized audit document.
- `/verify/[verificationHash]`: Public tamper-proof validation page.

---

## 5. Security, Validation & Error Handling

1. **Authorization**:
   - Only assigned judges can submit signatures for their own account in that round.
   - Only authenticated staff/scrutineers can execute emergency overrides or countersign.
2. **Tamper Invalidation**:
   - Any modification to scores automatically invalidates existing signatures (`status: "stale"`).
   - Publishing is strictly blocked if any signature is stale.
3. **Data Protection**:
   - SVG vector paths are sanitized against script injection before storage and rendering.
   - Verification public page redacts internal account IDs and credentials, showing only display names and verification timestamps.

---

## 6. Testing & Quality Assurance Plan

### Automated Tests (`convex-test` & Vitest)
1. **Signature Registration**: Verify judge can register specimen and retrieve it.
2. **Round Authorization**: Verify `scoresHash` is correctly computed server-side and attached to `roundSignatures`.
3. **Stale Invalidation**: Modify a score sheet after signing; verify query returns `status: "stale"`.
4. **Publishing Gate**: Attempt `publishRound` with missing judge signature; verify `CONFLICT` or `VALIDATION_ERROR` error thrown.
5. **Emergency Override**: Verify staff can override with justification and image storage ID.
6. **Snapshot Verification**: Verify `resultVersions.snapshot.certifications` contains full signature metadata and `verificationHash`.

### Manual & E2E Validation
1. Judge logs into `/enter/...` on tablet/mobile $\to$ verifies signature pad responsiveness and touch isolation.
2. Judge completes round scoring $\to$ verifies rank breakdown and performs 1-tap sign-off.
3. Staff opens review page $\to$ observes real-time status update without reload.
4. Staff countersigns and publishes round $\to$ verifies `/audit-sheet` print preview and scans QR code to verify public page.
