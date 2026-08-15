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

Only declare the implementation complete when the project is in a production-ready state.

<!-- convex-ai-end -->
