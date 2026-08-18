# Welcome to your Convex + Next.js app

This is a [Convex](https://convex.dev/) project created with [`npm create convex`](https://www.npmjs.com/package/create-convex).

After the initial setup (<2 minutes) you'll have a working full-stack app using:

- Convex as your backend (database, server logic)
- [React](https://react.dev/) as your frontend (web page interactivity)
- [Next.js](https://nextjs.org/) for optimized web hosting and page routing
- [Tailwind](https://tailwindcss.com/) for building great looking accessible UI

## Get started

If you just cloned this codebase and didn't use `npm create convex`, run:

```
npm install
npm run dev
```

If you're reading this README on GitHub and want to use this template, run:

```
npm create convex@latest -- -t nextjs
```

## Learn more

To learn more about developing your project with Convex, check out:

- The [Tour of Convex](https://docs.convex.dev/get-started) for a thorough introduction to Convex principles.
- The rest of [Convex docs](https://docs.convex.dev/) to learn about all Convex features.
- [Stack](https://stack.convex.dev/) for in-depth articles on advanced topics.

## Join the community

Join thousands of developers building full-stack apps with Convex:

- Join the [Convex Discord community](https://convex.dev/community) to get help in real-time.
- Follow [Convex on GitHub](https://github.com/get-convex/), star and contribute to the open-source implementation of Convex.

## AI features

Phase 5 adds three advisory AI features:

- **Judge integrity scoring** — deterministic statistics on the staff round
  monitor/review. No LLM, no API key needed. Advisory only.
- **AI event setup wizard** — `/app/<org>/events/new` → "Describe your event".
  Gemini generates a template you review before anything is created.
- **Results explainer** — "Why?" on result rows explains rankings from the
  official snapshot, with a verifiable source-data panel.

The wizard and explainer require the `GEMINI_API_KEY` Convex secret (never put
it in `.env.local` or any client-reachable file):

```
npx convex env add GEMINI_API_KEY
```

Daily AI quotas: 20 wizard calls / 30 explanations per organization (shared
across the org, resets at UTC midnight).
