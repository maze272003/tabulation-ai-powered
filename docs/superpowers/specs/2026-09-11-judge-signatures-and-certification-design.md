# Judge Digital Signature & Scrutineer Certification Suite Design

## 1. Executive Summary & Operational Problem

In competitive judging events (pageants, dance championships, talent competitions, cheer, gymnastics, martial arts, culinary competitions), the legal validity and integrity of results depend on verified human accountability. 

Prior to this feature, rounds auto-closed when all score sheets were submitted, allowing staff to publish standings without:
1. **Judge Confirmation**: Judges had no holistic review of their complete round scores or ranking order before results locked.
2. **Legal & Audit Sign-Off**: No digital signatures or impartiality affirmations were captured to prevent post-event dispute or unauthorized score tampering.
3. **Scrutineer Verification Gate**: Staff lacked a live verification matrix to ensure all judges were accounted for, had no paper backup capture protocol, and had no formal countersignature before publication.
4. **Tamper-Proof Audit Records**: Printed standings and certificates lacked verifiable cryptographic links to the original signed score sheets.

This feature delivers an enterprise-grade digital certification ecosystem:
- **Upfront Specimen Registration**: Fast (<15s) first-login signature onboarding for judges and staff with Draw (HTML5 canvas), Type (calligraphy fonts), and Upload modes.
- **BondPaper & Classic Sheet Integration**: Real SVG vector signatures embedded into `BondPaperScoreSheet` footers and confirmation dialogs.
- **One-Tap Round Certification**: Clear round scorecard summary with one-tap signature authorization and optional deduction remarks.
- **Tamper-Evident Stale Invalidation**: Server-computed deterministic SHA-256 score digests that immediately flag signatures as `stale` if any score is edited post-signing.
- **Scrutineer Command Matrix**: Live real-time certification grid, remote judge nudges, paper-backup photo capture for emergency overrides, and mandatory Scrutineer countersigning before publishing.
- **Public Verifiable Audit Sheets**: High-DPI printable Tabulation Audit Sheets with all affixed signatures and a public QR code verification landing page (`/verify/[hash]`).
- **Dynamic Certificate Tokens**: Automatic inclusion of verified signatures (`{{head_judge_signature}}`, `{{scrutineer_signature}}`, `{{verification_qr}}`) in the Document & Certificate Editor.

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
lastNudgeAt: v.optional(v.number()), // Timestamp for live staff nudges
lastNudgeMessage: v.optional(v.string()),

// userProfiles (for staff/scrutineers logged in via platform accounts)
signatureSpecimen: v.optional(v.string()),
signatureType: v.optional(v.union(v.literal("drawn"), v.literal("typed"), v.literal("uploaded"))),
signatureRegisteredAt: v.optional(v.number()),
titleOrAffiliation: v.optional(v.string()),
```

#### New Table: `roundSignatures`
Tracks digital signatures and certifications per round or overall event scope.
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
  svgPath: v.string(), // Vector signature paths (strictly validated against injection)
  signatureType: v.union(v.literal("drawn"), v.literal("typed"), v.literal("uploaded")),
  signedAt: v.number(),
  scoresHash: v.string(), // Server-computed deterministic SHA-256 digest of judge's scores
  judgeNotes: v.optional(v.string()),
  status: v.union(v.literal("valid"), v.literal("stale"), v.literal("superseded"), v.literal("overridden")),
  overrideReason: v.optional(v.string()),
  overrideAttachmentStorageId: v.optional(v.string()), // Convex storage ID for photo of physical paper sheet
  overriddenBy: v.optional(v.string()),
})
  .index("by_round_id", ["roundId"])
  .index("by_event_id_and_round_id", ["eventId", "roundId"])
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
1. When any judge enters the `/enter/...` portal, the layout checks `account.signatureSpecimen`.
2. If missing, a non-dismissible onboarding dialog mounts immediately before any score sheets are accessible.
3. The judge selects their preferred input mode:
   - **Draw**: Smooth HTML5 canvas with Catmull-Rom cubic bezier smoothing and pressure simulation (`touch-action: none` prevents viewport scrolling).
   - **Type**: Input legal name; preview rendered using elegant script calligraphy styles.
   - **Upload**: Upload existing clean PNG/SVG image.
4. Judge confirms full legal name, optional title/affiliation (e.g. "Adjudicator #3"), and checks the **Oath of Impartiality**:
   *"I solemnly swear on my honor to evaluate all contestants independently, honestly, and without bias in accordance with the official rules."*
5. Calls `enter/signatures:registerSignatureSpecimen`. Specimen is stored and the event dashboard unlocks.

### 3.2 Deterministic Server-Side Hash Generation (`scoresHash`)
To prevent client clock drift, formatting discrepancies, or malicious tampering, the client **never** generates its own hash. 
The server computes the digest inside the `enter/signatures:authorizeRound` mutation:
1. Load all submitted scores where `sheet.judgeId === account._id` and `sheet.roundId === round._id`.
2. Sort scores deterministically by `(contestantId, criterionId)` ascending.
3. Form canonical string:
   $$\text{payload} = \text{roundId} + "|" + \text{judgeId} + "|" + \sum (\text{contestantId} + ":" + \text{criterionId} + ":" + \text{value})$$
4. Compute SHA-256 via Web Crypto API:
   $$\text{scoresHash} = \text{SHA-256}(\text{payload})$$
5. Store in `roundSignatures` with status `valid`.

### 3.3 Automated Stale-Signature Invalidation
1. If any score sheet is updated, reopened, or unlocked via `submitSheet`, `saveRoundDraftsBatch`, or `submitRoundSheetsBatch`, Convex checks for existing `roundSignatures` for that judge and round.
2. If an existing signature is present, its status is immediately transitioned to `stale`.
3. In the Scrutineer review dashboard, a warning badge renders: `⚠️ Stale Signature (Scores updated after signature)`.
4. The round cannot be published until the judge re-authorizes or staff records an audited override.

### 3.4 BondPaperScoreSheet Integration
In `components/enter/BondPaperScoreSheet.tsx`:
1. The static mock signature line (lines 1065–1100) is updated to render the real, crisp vector SVG signature of the authenticated judge.
2. When the judge clicks "Confirm & Lock All", the confirmation dialog includes the 1-tap certification statement and signature preview.
3. Upon submission, it triggers the round certification automatically, stamping the sheet with:
   `DIGITALLY CERTIFIED • [Timestamp] • HASH: [scoresHash.slice(0, 8)]`.

### 3.5 Scrutineer Command Center & Gated Publication
In `/enter/round/[roundId]`:
1. **Judges Certification Matrix**:
   - Table showing each assigned judge:
     - 🟢 **Signed & Verified**: Renders vector signature preview, timestamp, and score hash.
     - 🟡 **Pending Signature**: All sheets submitted, awaiting 1-tap sign-off (with 1-click **Nudge** button).
     - 🔴 **Incomplete Sheets**: Scoring in progress.
     - ⚠️ **Stale Signature**: Scores modified post-signature.
     - 🛡️ **Emergency Override**: Audited override with optional camera upload of physical paper sheet.
2. **Real-Time Judge Nudge**:
   - Staff clicks "Nudge" next to a pending judge.
   - Updates `eventAccounts.lastNudgeAt`. The judge's tablet displays an animated prompt and subtle audio chime: *"Tabulation Request: Please review and sign your scorecard."*
3. **Emergency Override Protocol**:
   - If a judge device fails, staff selects "Emergency Override".
   - Staff enters mandatory justification (minimum 10 characters) and snaps a photo of the physical paper scorecard.
   - Photo is saved in Convex storage (`overrideAttachmentStorageId`).
4. **Scrutineer Countersigning & Publishing**:
   - Once all judges are 🟢 Signed or 🛡️ Overridden, the **Scrutineer Countersign** block unlocks.
   - Scrutineer applies their signature.
   - `publishRound` mutation verifies that every assigned judge and the scrutineer have valid certifications.
   - Bakes all signatures, notes, and the root `verificationHash` into `resultVersions.snapshot`.

### 3.6 Cryptographic Verification & Public Proof Page
1. **Root Verification Hash**:
   $$\text{verificationHash} = \text{SHA-256}(\text{roundId} + \text{snapshot.computedAt} + \text{standingsJSON} + \text{signaturesJSON})$$
2. **Public Verification Route** (`/verify/[verificationHash]`):
   - Publicly accessible without login.
   - Shows event name, organization branding, official round name, publication timestamp.
   - Displays verified panel of adjudicators and scrutineer with verified checkmarks and timestamps.
   - Confirms: *"Cryptographically Verified & Authentic Official Record"*.

### 3.7 Official Printable Tabulation Audit Sheet
- Route: `/enter/round/[roundId]/audit-sheet`.
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
    ├── VerificationBadge.tsx       // Status badges (Signed, Stale, Pending, Overridden)
    └── PaperAttachmentModal.tsx    // Lightbox modal for viewing paper backup photo
```

Routes:
- `/enter/round/[roundId]/audit-sheet`: Print-optimized audit document.
- `/verify/[verificationHash]`: Public tamper-proof validation page.

---

## 5. Security, Validation & Error Handling

1. **Authorization**:
   - Only assigned judges can submit signatures for their own account in that round.
   - Only authenticated staff/scrutineers can execute emergency overrides or countersign.
2. **SVG Path Sanitization**:
   - Server strictly validates `svgPath` against regex: `^[MmLlHhVvCcSsQqTtAaZz0-9, .\-]+$`. Any tag-like or malicious input is rejected with `VALIDATION_ERROR`.
3. **Tamper Invalidation**:
   - Any modification to scores automatically invalidates existing signatures (`status: "stale"`).
   - Publishing is strictly blocked if any signature is stale.
4. **Data Protection**:
   - Verification public page redacts internal account IDs and credentials, showing only display names and verification timestamps.

---

## 6. Testing & Quality Assurance Plan

### Automated Tests (`convex-test` & Vitest)
1. **Signature Registration**: Verify judge can register specimen and retrieve it.
2. **Round Authorization**: Verify `scoresHash` is correctly computed server-side and attached to `roundSignatures`.
3. **Stale Invalidation**: Modify a score sheet after signing; verify query returns `status: "stale"`.
4. **Publishing Gate**: Attempt `publishRound` with missing judge signature; verify `CONFLICT` error thrown.
5. **Emergency Override**: Verify staff can override with justification and image storage ID.
6. **Snapshot Verification**: Verify `resultVersions.snapshot.certifications` contains full signature metadata and `verificationHash`.

### Manual & E2E Validation
1. Judge logs into `/enter/...` on tablet/mobile $\to$ verifies signature pad responsiveness and touch isolation (`touch-action: none`).
2. Judge completes round scoring $\to$ verifies rank breakdown and performs 1-tap sign-off.
3. Staff opens review page $\to$ observes real-time status update without reload.
4. Staff countersigns and publishes round $\to$ verifies `/audit-sheet` print preview and scans QR code to verify public page.
