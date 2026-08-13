## Task 2: Better-Auth Convex component

**Files:**
- Create: `convex/betterAuth/convex.config.ts`
- Create: `convex/betterAuth/auth.ts`
- Create: `convex/betterAuth/adapter.ts`
- Generated: `convex/betterAuth/schema.ts` (by `npx auth generate`)
- Create: `convex/convex.config.ts`
- Create: `convex/auth.config.ts`
- Create: `convex/http.ts`

**Interfaces:**
- Produces: a mounted Better-Auth component, `ctx.auth.getUserIdentity()` resolvable once a client authenticates, HTTP route handlers for auth flows.
- Reference: official guide at `https://www.better-auth.com/docs/integrations/convex`.

- [ ] **Step 1: Create the component definition**

Create `convex/betterAuth/convex.config.ts`:
```ts
import { defineComponent } from "convex/server";

const component = defineComponent("betterAuth");

export default component;
```

- [ ] **Step 2: Register the component in the app config**

Create `convex/convex.config.ts`:
```ts
import { defineApp } from "convex/server";
import betterAuth from "./betterAuth/convex.config";

const app = defineApp();

app.use(betterAuth);

export default app;
```

- [ ] **Step 3: Create the auth.config.ts**

Create `convex/auth.config.ts`:
```ts
import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";
import type { AuthConfig } from "convex/server";

export default {
  providers: [getAuthConfigProvider()],
} satisfies AuthConfig;
```

- [ ] **Step 4: Create the Better-Auth instance**

Create `convex/betterAuth/auth.ts`:
```ts
import { createClient } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import type { GenericCtx } from "@convex-dev/better-auth/utils";
import type { BetterAuthOptions } from "better-auth";
import { betterAuth } from "better-auth";
import { components } from "../_generated/api";
import type { DataModel } from "../_generated/dataModel";
import authConfig from "../auth.config";
import schema from "./schema";

export const authComponent = createClient<DataModel, typeof schema>(
  components.betterAuth,
  {
    local: { schema },
    verbose: false,
  },
);

export const createAuthOptions = (ctx: GenericCtx<DataModel>): BetterAuthOptions => {
  return {
    appName: "Tabulation",
    baseURL: process.env.SITE_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    database: authComponent.adapter(ctx),
    emailAndPassword: { enabled: false },
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      },
    },
    plugins: [convex({ authConfig })],
  };
};

export const options = createAuthOptions({} as GenericCtx<DataModel>);

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth(createAuthOptions(ctx));
};
```

- [ ] **Step 5: Generate the Better-Auth schema**

Run:
```powershell
npx auth generate --config ./convex/betterAuth/auth.ts --output ./convex/betterAuth/schema.ts
```
Expected: a file appears at `convex/betterAuth/schema.ts` defining the Better-Auth tables (`user`, `session`, `account`, `verification`). If the command fails because `schema.ts` is referenced before it exists, create a stub `convex/betterAuth/schema.ts` with `export default {};` first, then re-run.

- [ ] **Step 6: Create the adapter**

Create `convex/betterAuth/adapter.ts`:
```ts
import { createApi } from "@convex-dev/better-auth";
import { createAuthOptions } from "./auth";
import schema from "./schema";

export const {
  create,
  findOne,
  findMany,
  updateOne,
  updateMany,
  deleteOne,
  deleteMany,
} = createApi(schema, createAuthOptions);
```

- [ ] **Step 7: Mount HTTP handlers**

Create `convex/http.ts`:
```ts
import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./betterAuth/auth";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth);

export default http;
```

- [ ] **Step 8: Verify the backend deploys**

Run `npx convex dev` in a separate terminal (keep it running). Expected: no errors; the schema generates and the component mounts. If `convex dev` reports a schema error from the still-present demo `numbers` table, that is fine for now — the demo is removed in Task 4.

- [ ] **Step 9: Commit**

```powershell
git add convex/betterAuth convex/convex.config.ts convex/auth.config.ts convex/http.ts
git commit -m "feat: mount @convex-dev/better-auth component"
```

---

