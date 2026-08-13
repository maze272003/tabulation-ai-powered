## Task 5: Test harness

**Files:**
- Create: `convex-test/setup.ts`
- Create: `convex-test/sanity.test.ts`

**Interfaces:**
- Produces: a reusable test harness exposing `asUser(identity)` and `asAnonymous()` contexts, plus a passing sanity test.

- [ ] **Step 1: Create the test harness**

Create `convex-test/setup.ts`:
```ts
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

const testModules = import.meta.glob("../convex/**/*.ts", { eager: true });

export function setupTest() {
  return convexTest(schema, testModules);
}

export const aliceIdentity = {
  tokenIdentifier: "alice-token",
  subject: "alice-subject",
  name: "Alice",
  email: "alice@example.com",
  pictureUrl: "https://example.com/a.png",
  issuer: "https://tabulation.example.com",
} as const;

export const bobIdentity = {
  tokenIdentifier: "bob-token",
  subject: "bob-subject",
  name: "Bob",
  email: "bob@example.com",
  pictureUrl: "https://example.com/b.png",
  issuer: "https://tabulation.example.com",
} as const;

export async function seedAndProvision(
  t: ReturnType<typeof setupTest>,
  identity: typeof aliceIdentity,
) {
  await t.runMutation(api.seed.seedReferenceData, {});
  return t.runMutation(api.auth.ensureUserProfile, {}, { userIdentity: identity });
}
```

- [ ] **Step 2: Create a sanity test**

Create `convex-test/sanity.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import { aliceIdentity, setupTest } from "./setup";

describe("sanity", () => {
  it("returns null for anonymous getCurrentUser", async () => {
    const t = setupTest();
    const result = await t.runQuery(api.auth.getCurrentUser, {});
    expect(result).toBeNull();
  });

  it("provisions a profile for an authenticated user", async () => {
    const t = setupTest();
    await t.runMutation(api.auth.ensureUserProfile, {}, { userIdentity: aliceIdentity });
    const result = await t.runQuery(api.auth.getCurrentUser, {}, { userIdentity: aliceIdentity });
    expect(result?.email).toBe("alice@example.com");
  });
});
```

- [ ] **Step 3: Run — expect failure (seedReferenceData does not exist yet)**

Run:
```powershell
npm test
```
Expected: FAIL (`api.seed.seedReferenceData` is undefined). This confirms the harness runs and proves the test reaches the backend.

- [ ] **Step 4: Commit**

```powershell
git add convex-test/setup.ts convex-test/sanity.test.ts
git commit -m "test: add convex-test harness"
```

---

