# Judge Digital Signature & Scrutineer Certification Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete, legally robust digital signature and certification system where judges register signatures on first login, authorize round scorecards with a 1-tap verification, scrutineers monitor a live certification matrix with emergency overrides and countersignatures before publishing, and all published results generate printable, QR-verified Tabulation Audit Sheets.

**Architecture:** Extend Convex schema with `roundSignatures` and account specimen fields. Compute deterministic server-side SHA-256 score digests (`scoresHash`) to auto-invalidate stale signatures upon score modification. Gate `publishRound` on 100% judge certification + Scrutineer countersign, baking signatures and a root verification hash into `resultVersions.snapshot`. Provide native HTML5 bezier vector signature capture and high-DPI `@media print` audit sheet pages.

**Tech Stack:** Convex (TypeScript backend, queries, mutations, indexes, file storage), Next.js 15 (App Router, React 19, Tailwind CSS), HTML5 Canvas API (Catmull-Rom cubic bezier vector extraction), Web Crypto API (deterministic SHA-256 digests), Lucide Icons, Sonner toasts.

**Spec:** `docs/superpowers/specs/2026-09-11-judge-signatures-and-certification-design.md`

## Global Constraints
- Every Convex function must use the object-form syntax (`args: { ... }, handler: async (ctx, args) => { ... }`).
- All user-facing code must be strictly typed without `any` or `@ts-ignore`.
- Server-authoritative hashing: client never submits its own `scoresHash`.
- SVG path strings must be validated against `^[MmLlHhVvCcSsQqTtAaZz0-9, .\-]+$` to prevent XSS.
- Touch isolation on canvas pads (`touch-action: none; user-select: none;`) to prevent mobile viewport scrolling.
- Zero heavy external PDF packages: use native CSS `@media print` with vector rendering for 300+ DPI output.

---

### Task 1: Convex Schema Extensions & Snapshot Types

**Files:**
- Modify: `convex/schema.ts`
- Test: `test/schema-signatures.test.ts`

**Interfaces:**
- Consumes: Existing `eventAccounts`, `userProfiles`, `resultVersions` in `convex/schema.ts`.
- Produces: `roundSignatures` table and extended account/snapshot fields.

- [ ] **Step 1: Write schema test for signature fields**
Create `test/schema-signatures.test.ts` verifying that `roundSignatures` and extended fields exist and validate types properly.

```ts
import { describe, it, expect } from "vitest";
import schema from "../convex/schema";

describe("Signatures Schema Definition", () => {
  it("defines roundSignatures table with required indexes", () => {
    const tables = schema.tables;
    expect(tables).toHaveProperty("roundSignatures");
    const roundSignatures = tables.roundSignatures;
    expect(roundSignatures.indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ indexDescriptor: "by_round_id", fields: ["roundId"] }),
        expect.objectContaining({ indexDescriptor: "by_event_id_and_round_id", fields: ["eventId", "roundId"] }),
        expect.objectContaining({ indexDescriptor: "by_event_id_and_scope", fields: ["eventId", "scope"] }),
        expect.objectContaining({ indexDescriptor: "by_round_and_actor", fields: ["roundId", "actorId"] }),
      ])
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run test/schema-signatures.test.ts`
Expected: FAIL with "roundSignatures property not found".

- [ ] **Step 3: Update `convex/schema.ts`**
Add `signatureSpecimen`, `signatureType`, `signatureRegisteredAt`, `titleOrAffiliation`, `lastNudgeAt`, `lastNudgeMessage` to `eventAccounts` and `userProfiles`. Define `roundSignatures` table and update `resultVersions.snapshot` with `certifications` and `verificationHash`.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run test/schema-signatures.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add convex/schema.ts test/schema-signatures.test.ts; git commit -m "feat(signatures): define roundSignatures table and schema extensions"
```

---

### Task 2: Backend Certification Mutations & Queries (`convex/signatures.ts`)

**Files:**
- Create: `convex/signatures.ts`
- Test: `test/signatures-backend.test.ts`

**Interfaces:**
- Consumes: `requireEventSession`, `writeAudit`, `scores`, `scoreSheets`, `rounds`.
- Produces:
  - `registerSignatureSpecimen`: `(sessionToken, svgPath, signatureType, titleOrAffiliation) => void`
  - `authorizeRound`: `(sessionToken, roundId, svgPath, signatureType, judgeNotes) => { signatureId, scoresHash }`
  - `getRoundCertificationStatus`: `(sessionToken, roundId) => CertificationMatrix`
  - `nudgeJudge`: `(sessionToken, roundId, judgeId, message) => void`
  - `overrideJudgeSignature`: `(sessionToken, roundId, judgeId, reason, attachmentStorageId) => void`
  - `scrutineerCountersign`: `(sessionToken, roundId, svgPath, signatureType) => void`
  - `getPublicVerificationRecord`: `(verificationHash) => VerificationRecord`

- [ ] **Step 1: Write tests for signature registration and deterministic hashing**
Create `test/signatures-backend.test.ts` to test `registerSignatureSpecimen`, canonical hash generation, and authorization.

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run test/signatures-backend.test.ts`
Expected: FAIL with "signatures.ts not found".

- [ ] **Step 3: Implement `convex/signatures.ts`**
Implement all queries and mutations with:
- Strict SVG regex sanitization: `^[MmLlHhVvCcSsQqTtAaZz0-9, .\-]+$`.
- Server-side canonical string sort of scores and SHA-256 calculation.
- Stale status detection by comparing stored `scoresHash` with live computed scores hash.
- Audit logging via `writeAudit`.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run test/signatures-backend.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add convex/signatures.ts test/signatures-backend.test.ts; git commit -m "feat(signatures): implement core backend mutations and queries"
```

---

### Task 3: Score Invalidation Hook & Strict Publishing Gate

**Files:**
- Modify: `convex/enter/scoring.ts` (lines 230-240, 480-510)
- Modify: `convex/enter/rounds.ts` (`publishRound`, lines 425-465)
- Test: `test/publishing-gate.test.ts`

**Interfaces:**
- Consumes: `roundSignatures`, `roundCertificationStatus`.
- Produces: Hard-gated `publishRound` requiring all valid signatures and embedding `snapshot.certifications`.

- [ ] **Step 1: Write failing test for publishing gate**
Create `test/publishing-gate.test.ts` asserting that `publishRound` fails with `CONFLICT` if any assigned judge has not certified or if a signature is `stale`, and succeeds when all judges + Scrutineer have signed.

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run test/publishing-gate.test.ts`
Expected: FAIL.

- [ ] **Step 3: Update `convex/enter/scoring.ts` & `convex/enter/rounds.ts`**
- In `submitSheet`, `saveRoundDraftsBatch`, `submitRoundSheetsBatch`: if scores are written for a round that has an existing `roundSignatures` entry, transition its status to `"stale"`.
- In `publishRound`: query all assigned judges. Require `roundSignatures` for every judge with `status: "valid"` or `"overridden"`. Require Scrutineer signature. Compute root `verificationHash`. Embed into `snapshot.certifications`.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run test/publishing-gate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add convex/enter/scoring.ts convex/enter/rounds.ts test/publishing-gate.test.ts; git commit -m "feat(signatures): enforce publishing gate and automatic stale signature invalidation"
```

---

### Task 4: Reusable Multi-Modal Signature Pad UI Component

**Files:**
- Create: `components/signatures/SignaturePad.tsx`
- Test: `test/SignaturePad.test.tsx`

**Interfaces:**
- Produces: `<SignaturePad value={svgPath} onChange={(svg, type) => void} />` with Draw, Type, and Upload tabs.

- [ ] **Step 1: Write component test for SignaturePad**
Create `test/SignaturePad.test.tsx` verifying drawing canvas, type mode selection, and SVG path extraction.

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run test/SignaturePad.test.tsx`
Expected: FAIL with "SignaturePad not found".

- [ ] **Step 3: Implement `components/signatures/SignaturePad.tsx`**
- Canvas with pointer events (`onPointerDown`, `onPointerMove`, `onPointerUp`) and `setPointerCapture`.
- CSS `touch-action: none` to isolate touch gestures.
- Catmull-Rom or quadratic bezier smoothing to output normalized SVG `<path d="..." />`.
- "Type" tab with selection of 4 script fonts (`Dancing Script`, `Great Vibes`, `Caveat`, `Allura`).
- "Upload" tab with file input and SVG/PNG preview.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run test/SignaturePad.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add components/signatures/SignaturePad.tsx test/SignaturePad.test.tsx; git commit -m "feat(ui): create multi-modal SignaturePad component"
```

---

### Task 5: First-Login Onboarding Gate & Live Nudge Receiver

**Files:**
- Create: `components/signatures/JudgeSignatureGate.tsx`
- Modify: `app/enter/layout.tsx`
- Test: `test/JudgeSignatureGate.test.tsx`

**Interfaces:**
- Consumes: `api.signatures.registerSignatureSpecimen`, `eventAccounts.lastNudgeAt`.
- Produces: Intercepting modal for judges without signatures; audio/visual nudge listener.

- [ ] **Step 1: Write test for JudgeSignatureGate**
Create `test/JudgeSignatureGate.test.tsx` verifying gate renders when `account.signatureSpecimen` is undefined, and blocks closing until saved.

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run test/JudgeSignatureGate.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement `JudgeSignatureGate.tsx` and integrate in `app/enter/layout.tsx`**
- Mounts non-dismissible modal with `SignaturePad`, Name confirmation, Title/Affiliation, and Impartiality Oath checkbox.
- Listens to `account.lastNudgeAt`. When updated, triggers Sonner toast with subtle audio chime prompting judge to certify their round.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run test/JudgeSignatureGate.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add components/signatures/JudgeSignatureGate.tsx app/enter/layout.tsx test/JudgeSignatureGate.test.tsx; git commit -m "feat(signatures): add first-login signature onboarding gate and live nudge listener"
```

---

### Task 6: BondPaperScoreSheet & Round Summary Authorization Integration

**Files:**
- Modify: `components/enter/BondPaperScoreSheet.tsx` (lines 1050-1170)
- Create: `components/signatures/JudgeRoundSummaryModal.tsx`
- Test: `test/BondPaperSignature.test.tsx`

**Interfaces:**
- Consumes: `api.signatures.authorizeRound`, `account.signatureSpecimen`.
- Produces: Real vector signatures rendered in sheet footer; 1-tap round certification card in submit confirmation.

- [ ] **Step 1: Write test for BondPaperScoreSheet signature footer**
Verify `BondPaperScoreSheet` renders the registered vector SVG in the footer instead of placeholder text, and displays the verification hash stamp.

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run test/BondPaperSignature.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Update `BondPaperScoreSheet.tsx` & create `JudgeRoundSummaryModal.tsx`**
- Replace static text in lines 1065-1100 with SVG `<svg><path d={judgeSignature} /></svg>`.
- In submit confirmation dialog: show 1-tap "Affirm & Certify" button.
- Create `JudgeRoundSummaryModal.tsx` displaying the complete ranking table and authorization action.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run test/BondPaperSignature.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add components/enter/BondPaperScoreSheet.tsx components/signatures/JudgeRoundSummaryModal.tsx test/BondPaperSignature.test.tsx; git commit -m "feat(signatures): integrate vector signatures into bond paper sheet and round summary"
```

---

### Task 7: Scrutineer Certification Matrix, Override & Publishing UI

**Files:**
- Create: `components/signatures/ScrutineerSignOffCard.tsx`
- Create: `components/signatures/PaperAttachmentModal.tsx`
- Modify: `app/enter/round/[roundId]/page.tsx` or staff review view
- Test: `test/ScrutineerSignOffCard.test.tsx`

**Interfaces:**
- Consumes: `api.signatures.getRoundCertificationStatus`, `api.signatures.nudgeJudge`, `api.signatures.overrideJudgeSignature`, `api.signatures.scrutineerCountersign`.
- Produces: Staff review matrix, 1-click nudge, camera paper override, and countersign block.

- [ ] **Step 1: Write test for ScrutineerSignOffCard**
Verify matrix renders status chips for each judge (🟢 Signed, 🟡 Pending, ⚠️ Stale, 🛡️ Overridden), unlocks countersign when all green/overridden, and controls "Publish" button state.

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run test/ScrutineerSignOffCard.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement `ScrutineerSignOffCard.tsx` and `PaperAttachmentModal.tsx`**
- Real-time reactive table of judges.
- "Nudge" button calling `api.signatures.nudgeJudge`.
- "Emergency Override" dialog with reason text and camera upload (`accept="image/*" capture="environment"`).
- Scrutineer countersign pad.
- Hook into publish button.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run test/ScrutineerSignOffCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add components/signatures/ScrutineerSignOffCard.tsx components/signatures/PaperAttachmentModal.tsx test/ScrutineerSignOffCard.test.tsx; git commit -m "feat(signatures): implement scrutineer certification matrix and emergency override UI"
```

---

### Task 8: Printable Tabulation Audit Sheet & Public Verification Route

**Files:**
- Create: `app/enter/round/[roundId]/audit-sheet/page.tsx`
- Create: `app/verify/[hash]/page.tsx`
- Test: `test/audit-sheet.test.tsx`

**Interfaces:**
- Consumes: `api.enter.rounds.roundReview`, `api.signatures.getPublicVerificationRecord`.
- Produces: Print-optimized 300-DPI audit document with QR code; public unauthenticated proof page.

- [ ] **Step 1: Write tests for audit-sheet and verify routes**
Test that `/verify/[hash]` renders without authentication and displays verified checkmarks and timestamps.

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run test/audit-sheet.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement `audit-sheet/page.tsx` & `verify/[hash]/page.tsx`**
- `audit-sheet`: `@media print` rules, header, standings table, judge criterion matrix, vector signatures, QR code linking to `/verify/[hash]`.
- `verify/[hash]`: clean public verification portal with official seal, event details, and tamper-proof validity statement.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run test/audit-sheet.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add app/enter/round/[roundId]/audit-sheet/page.tsx app/verify/[hash]/page.tsx test/audit-sheet.test.tsx; git commit -m "feat(signatures): add printable tabulation audit sheet and public verification portal"
```

---

### Task 9: End-to-End System Validation & Build Gate

**Files:**
- Modify: `e2e/signatures-certification.spec.ts` (Playwright E2E test)
- Command: `npm run build`

- [ ] **Step 1: Write Playwright E2E test**
Create `e2e/signatures-certification.spec.ts` covering:
1. Judge logs in $\to$ registers signature via onboarding pad.
2. Judge completes score sheets $\to$ verifies summary and signs round.
3. Staff opens review $\to$ sees 🟢 Signed badge $\to$ countersigns as Scrutineer $\to$ publishes round.
4. Staff opens `/audit-sheet` $\to$ verifies print document.
5. Unauthenticated user visits `/verify/[hash]` $\to$ verifies proof page.

- [ ] **Step 2: Run build gate**
Run: `npm run build`
Expected: Exit code 0, clean Next.js production build.

- [ ] **Step 3: Run E2E test**
Run: `npx playwright test e2e/signatures-certification.spec.ts`
Expected: All tests PASS.

- [ ] **Step 4: Final Commit**
```bash
git add e2e/signatures-certification.spec.ts; git commit -m "test(signatures): add end-to-end certification suite tests"
```
