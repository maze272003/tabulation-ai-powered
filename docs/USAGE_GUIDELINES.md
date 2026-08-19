# Tabulation AI — System Usage & Configuration Guidelines

This comprehensive guide explains how to use **Tabulation AI**, configure live competitions without validation errors, leverage the **AI Event Generator**, and integrate the **`BorderBeamPanel`** UI primitive.

---

## Table of Contents
1. [Competition Lifecycle & Weight Configuration (Zero-Error Rules)](#1-competition-lifecycle--weight-configuration-zero-error-rules)
2. [How to Use the AI Event Generator (100% Balanced & Error-Free)](#2-how-to-use-the-ai-event-generator-100-balanced--error-free)
3. [How to Use the `BorderBeamPanel` Visual Component](#3-how-to-use-the-borderbeampanel-visual-component)
4. [Step-by-Step Organizer & Judge Workflow](#4-step-by-step-organizer--judge-workflow)
5. [Troubleshooting & Validation Reference](#5-troubleshooting--validation-reference)

---

## 1. Competition Lifecycle & Weight Configuration (Zero-Error Rules)

In the Tabulation system, mathematical precision is enforced to guarantee 100% fair and auditable results.

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│   1. DRAFT      │  ───> │   2. READY      │  ───> │  3. FINALIZED   │
│ Config editable │       │ Scoring live    │       │ Results frozen  │
└─────────────────┘       └─────────────────┘       └─────────────────┘
```

### The Two Golden Weight Rules:

#### Rule 1: Criteria Weights within EACH Round Must Total Exactly 100%
Every criterion in a round represents a percentage of that round's total score.
- **Valid Example (100%)**:
  - Vocal Technique: `40%`
  - Stage Presence: `30%`
  - Musicality: `30%`
  - **Total**: `40 + 30 + 30 = 100%` (Green / Valid)
- **Invalid Example (Red Error Banner)**:
  - Criterion 1: `75%`
  - Criterion 2: `25%`
  - Criterion 3: `25%`
  - **Total**: `125%` ❌ *(Publishing will be blocked until corrected)*

#### Rule 2: Round Weights across the ENTIRE Event Must Total Exactly 100%
Round weights determine how much each competition stage contributes to the final overall score.
- **Single-Round Event**: Set Round Weight to `100%`.
- **Multi-Round Event (e.g. 3 Rounds)**:
  - Preliminary Round: `35%`
  - Semi-Finals: `35%`
  - Grand Finals: `30%`
  - **Total**: `35 + 35 + 30 = 100%` (Valid)

---

## 2. How to Use the AI Event Generator (100% Balanced & Error-Free)

The built-in **AI Event Wizard** uses Google Gemini to automatically generate complete competition structures (rounds, criteria, scales, weights, and advancement rules) from natural language prompts.

### What Makes It Error-Free?
- **Automatic Mathematical Normalization**: Any criteria weights or round weights generated are mathematically auto-balanced so they **ALWAYS equal exactly 100%**.
- **Pre-validated Scales**: Sets standardized score scales (e.g. `50–100` or `0–100`) and decimal precisions (`2 decimals`).
- **Domain Guardrails**: Strict filtering prevents invalid or off-topic schemas.

### Sample Prompts to Try:

#### A. Beauty Pageant
> *"Create a 3-round beauty pageant with Prelims (Swimsuit 40%, Evening Gown 40%, Interview 20%), Semi-Finals (Top 10 advance), and Grand Finals (Q&A 60%, Final Look 40%)."*

#### B. Singing Competition
> *"Design a vocal battle with 2 rounds: Elimination Round (Tone 30%, Pitch 40%, Timing 30% — top 50% advance) and Championship Round (Overall Performance 60%, Musicality 40%)."*

#### C. Hackathon / Startup Pitch
> *"Create a startup demo day competition with 1 round: Innovation (30%), Technical Execution (30%), Market Potential (25%), and Presentation Delivery (15%). Scale 1-10 with 2 decimals."*

#### D. Dance Crew Battle
> *"Dance competition with 2 rounds: Preliminary Choreography (Synchronization 40%, Technique 30%, Stage Energy 30%) and Finals Freestyle (Creativity 50%, Musicality 50%)."*

---

## 3. How to Use the `BorderBeamPanel` Visual Component

The `BorderBeamPanel` primitive creates GPU-accelerated conic gradient border animations with ambient backdrop glow, full theme token compatibility, and built-in accessibility.

### Component API Reference

```tsx
import { BorderBeamPanel } from "@/components/ui/border-beam-panel";
```

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `children` | `React.ReactNode` | *(Required)* | The card or surface content to wrap. |
| `className` | `string` | `""` | Additional styling on the inner content container. |
| `containerClassName` | `string` | `""` | Additional styling on the outer relative wrapper. |
| `borderWidth` | `number` | `1.5` | Border thickness in pixels (`1` to `3` recommended). |
| `beamColor` | `string` | `""` | Gradient conic beam colors (defaults to primary theme gradient). |
| `duration` | `number` | `6` | Beam rotation duration in seconds. |
| `glow` | `boolean` | `false` | When `true`, enables a soft ambient colored backdrop glow. |

### Code Examples

#### Example 1: Highlighting a Featured Plan or Card
```tsx
import { BorderBeamPanel } from "@/components/ui/border-beam-panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function FeaturedPricingCard() {
  return (
    <BorderBeamPanel glow duration={5} className="bg-card p-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-heading text-xl font-bold">Growth Tier</h3>
        <Badge className="bg-primary text-primary-foreground">Recommended</Badge>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Ideal for multi-category pageants and regional festivals.
      </p>
      <div className="text-3xl font-extrabold mb-6">₱1,499 <span className="text-xs font-normal">/ month</span></div>
      <Button className="w-full">Upgrade to Growth</Button>
    </BorderBeamPanel>
  );
}
```

#### Example 2: Active Live Event or Scoring Banner
```tsx
export function LiveEventStatusCard({ eventName, status }: { eventName: string; status: string }) {
  return (
    <BorderBeamPanel
      borderWidth={2}
      duration={4}
      beamColor="conic-gradient(from 0deg, transparent 0deg, rgba(34, 197, 94, 0.9) 180deg, transparent 360deg)"
      className="bg-card p-4"
    >
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-bold text-success uppercase tracking-wider">● Live Scoring Active</span>
          <h4 className="text-base font-bold text-foreground">{eventName}</h4>
        </div>
        <Badge className="bg-success-muted text-success border-success/30">Round 1 in Progress</Badge>
      </div>
    </BorderBeamPanel>
  );
}
```

---

## 4. Step-by-Step Organizer & Judge Workflow

### Step 1: Create or Generate Your Event
1. Navigate to **Events & Competitions** in your organization sidebar.
2. Click **+ New Event**.
3. Choose either **Manual Setup** or type your prompt in the **AI Event Wizard**.
4. Click **Create Event**.

### Step 2: Configure Categories, Contestants & Judges
1. **Contestants**: Add contestants or import from CSV (`#`, `Name`, `Category`).
2. **Accounts**: Add Judge accounts or click **Bulk Generate Judges** to automatically create print-ready credentials.

### Step 3: Verify Weights & Publish
1. Go to the **Rounds** tab.
2. Verify that:
   - Every round shows `Criterion weights: 100%` (not 125% or 90%).
   - The bottom bar shows `Round weights: 100% of 100%`.
3. Open the **Readiness** tab and click **Publish Event**.

### Step 4: Live Judging & Scoring Entry
1. Judges open `/enter` and log in with their assigned username & password.
2. They enter scores using touch-friendly sliders or numerical inputs.
3. Once reviewed, they submit their scores immutably.

### Step 5: Review Standings & Publish Results
1. Staff navigate to **Rounds > Review**.
2. If any ties exist, click **Resolve Tie** to set final placements.
3. Click **Publish Round Results**.
4. Audience and contestants can immediately view live leaderboards at `/public/[eventCode]`.

---

## 5. Troubleshooting & Validation Reference

| Symptom | Cause | Resolution |
| :--- | :--- | :--- |
| **"Criterion weights: 125%" (Red)** | Criteria weights in the round exceed 100%. | Adjust criterion percentages so their sum is exactly `100%`. |
| **"Round weights must total 100%"** | Round weights across all competition rounds do not equal 100%. | Edit round weights so total is `100%` (e.g. 50% + 50%). |
| **Publish button disabled in Readiness** | Missing contestants, judges, or weight imbalance. | Check the Readiness checklist for any items marked with an alert. |
| **AI prompt rejected** | Prompt was off-topic or not describing a competition. | Describe a judged live competition (pageant, dance, singing, etc.). |
