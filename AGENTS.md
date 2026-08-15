<!-- convex-ai-start -->

# Convex AI Project Instructions

This project uses [Convex](https://convex.dev) as its backend.

## Convex Rules

When working on any Convex code:

1. **Always read `convex/_generated/ai/guidelines.md` first.**
2. Follow the Convex APIs, patterns, validators, queries, mutations, actions, and schema conventions defined in that file.
3. Never assume a Convex API pattern from prior knowledge if the project guidelines provide a specific implementation.
4. If Convex agent skills are required, install them with:

```bash
npx convex ai-files install
```

## Graphify Context

This project uses **Graphify** as a codebase knowledge graph and architectural context source.

Before making significant changes to the codebase, **inspect and use the Graphify knowledge graph to understand the existing project structure, dependencies, relationships, and architecture.**

### Graphify Rules

1. **Always check the Graphify-generated context before making significant architectural or cross-file changes.**
2. Use Graphify to understand:

   * Project/module relationships
   * File dependencies
   * Convex functions and their consumers
   * Queries, mutations, and actions relationships
   * Components and their dependencies
   * Shared utilities and services
   * Data flow between frontend and backend
   * Potentially affected files before modifying existing functionality
3. **Do not treat Graphify output as the source of truth for implementation rules.** Convex guidelines and the actual source code remain authoritative.
4. When Graphify context is available, use it to identify the smallest relevant area of the codebase before exploring or modifying files.
5. If Graphify context is stale, incomplete, missing, or unavailable, inspect the actual source code instead and do not invent Graphify information.
6. After significant architectural changes, regenerate or refresh the Graphify context when the project's Graphify workflow supports it.
7. Avoid unnecessarily modifying files that Graphify indicates are unrelated to the requested change.

### Graphify Context Priority

When reasoning about this project, use the following priority:

1. **Actual source code** — authoritative implementation
2. **`convex/_generated/ai/guidelines.md`** — authoritative Convex development rules
3. **Graphify knowledge graph** — architectural/dependency context
4. Existing documentation/comments
5. General framework knowledge

### Graphify Inspection

Before implementing a significant change:

```text
1. Inspect the relevant Graphify context.
2. Identify affected files/modules and their relationships.
3. Read the actual source files involved.
4. Follow the Convex guidelines.
5. Implement the smallest safe change.
6. Validate the affected functionality.
7. Refresh Graphify context if necessary.
```

Do not assume a relationship exists merely because Graphify suggests it. Verify important relationships against the actual source code.

## UI/UX Rules

For any UI/UX-related task, **always use the `/ui-ux-pro-max` skill**.

```text
/skill
/ui-ux-pro-max
```

Do not implement UI changes without applying the UI/UX Pro Max guidelines.

The UI must be:

* Production-quality
* Responsive
* Accessible
* Consistent with the existing design system
* Properly validated for loading, empty, error, and success states
* Free from obvious visual or interaction issues

## Required Validation

After completing UI/UX implementation or any significant application change, always run:

```bash
npm run build
```

Treat the build as a required validation gate.

If the build fails:

1. Analyze the error.
2. Fix the underlying issue.
3. Run `npm run build` again.
4. Continue until the build passes successfully.

Do **not** consider the task complete while the production build is failing.

## Production-Ready Requirement

Before declaring the task complete, verify that:

* The application builds successfully.
* There are no TypeScript/build errors.
* Convex code follows the project guidelines.
* UI/UX requirements are satisfied.
* No obvious runtime or validation issues were introduced.
* Existing functionality has not been unnecessarily broken.
* Relevant Graphify context has been inspected for significant changes.
* Important architectural/dependency assumptions have been verified against the actual source code.

Only declare the implementation complete when the project is in a production-ready state.

<!-- convex-ai-end -->
