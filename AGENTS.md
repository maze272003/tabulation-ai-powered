<!-- convex-ai-start -->

# Convex AI Project Instructions

This project uses [Convex](https://convex.dev) as its backend.

## Engineering Standard

All code in this project must be written and reviewed using **senior-level production engineering standards equivalent to an experienced engineer with 10+ years of software development experience**.

Apply strong knowledge of:

* Software architecture and design patterns
* Clean Code principles
* SOLID principles
* DRY / KISS principles
* Separation of concerns
* Defensive programming
* Secure coding practices
* Performance optimization
* Database design and query optimization
* TypeScript/JavaScript best practices
* React/Next.js best practices
* Convex architecture and function design
* Automated testing
* Error handling and observability
* Maintainability and long-term scalability
* SonarQube/SonarLint code-quality standards

Do not produce code that merely "works." Produce code that is **readable, maintainable, testable, secure, performant, and production-ready**.

Prefer simple, explicit, maintainable solutions over clever or unnecessarily complex implementations.

---

# Convex Rules

When working on any Convex code:

1. **Always read `convex/_generated/ai/guidelines.md` first.**
2. Follow the Convex APIs, patterns, validators, queries, mutations, actions, and schema conventions defined in that file.
3. Never assume a Convex API pattern from prior knowledge if the project guidelines provide a specific implementation.
4. If Convex agent skills are required, install them with:

```bash
npx convex ai-files install
```

5. Never bypass Convex validation, authorization, or architectural conventions simply to make an implementation work faster.
6. Keep queries, mutations, and actions focused and appropriately scoped.
7. Validate all external/user-controlled inputs.
8. Avoid unnecessary database reads/writes.
9. Avoid N+1 query patterns.
10. Preserve existing Convex data relationships and behavior unless the requested change explicitly requires modifying them.

---

# SonarQube / Code Quality Standards

All implementation must follow **SonarQube-quality production standards**.

The objective is not to silence SonarQube warnings. The objective is to write code that naturally satisfies static-analysis and maintainability requirements.

## 1. Bugs

Do not introduce code with known or likely bugs.

Before completing a change, verify:

* Null/undefined handling
* Boundary conditions
* Empty collections
* Invalid input
* Async failures
* Race conditions where applicable
* Incorrect type assumptions
* Resource lifecycle issues
* Incorrect error propagation
* State synchronization issues

Never ignore a potential bug merely because the compiler does not detect it.

---

## 2. Code Smells

Avoid common maintainability problems such as:

* Duplicated logic
* Large functions
* Large classes/modules
* Excessive nesting
* Excessive conditional complexity
* Long parameter lists
* God objects
* Dead code
* Unused variables/imports
* Repeated magic values
* Poor naming
* Unnecessary abstractions
* Inconsistent error handling
* Excessive comments explaining bad code instead of improving the code

When SonarQube identifies a code smell, prefer fixing the underlying design rather than suppressing the rule.

---

## 3. Cognitive Complexity

Keep code easy to understand.

Avoid deeply nested:

```text
if
  if
    if
      loop
        switch
          try
```

Prefer:

* Early returns
* Guard clauses
* Small focused functions
* Well-named helper functions
* Clear control flow
* Appropriate abstractions

Do not split code into meaningless micro-functions solely to reduce a SonarQube complexity score.

The resulting code must become **actually easier to understand**, not merely numerically compliant.

---

## 4. Duplication

Do not copy/paste business logic.

When the same logic appears multiple times:

1. Determine whether the behavior is genuinely shared.
2. Extract an appropriate reusable function/module.
3. Keep the abstraction focused.
4. Do not create generic utilities that obscure simple logic.

Avoid premature abstraction when two pieces of code only happen to look similar but have different business responsibilities.

---

## 5. Naming

Use descriptive names that communicate intent.

Prefer:

```ts
const activeUserCount = ...
const hasPermission = ...
const formattedRecordId = ...
```

Over:

```ts
const x = ...
const data = ...
const temp = ...
const flag = ...
```

Functions should describe their behavior.

Prefer:

```ts
getActiveUsers()
validateUserPermission()
calculateAvailableQuantity()
```

Avoid vague names such as:

```ts
process()
handle()
doSomething()
manageData()
```

unless the context genuinely makes the meaning obvious.

---

## 6. TypeScript Standards

Use TypeScript strictly and safely.

### Required principles

* Prefer explicit types where they improve clarity.
* Avoid `any`.
* Avoid unnecessary type assertions.
* Do not use `@ts-ignore` to hide real problems.
* Prefer proper type narrowing.
* Use discriminated unions when appropriate.
* Keep interfaces/types cohesive.
* Avoid overly broad types.
* Handle nullable values explicitly.

Do not solve TypeScript errors by weakening the type system.

Bad:

```ts
const value = response as any;
```

Better:

```ts
if (!response) {
  return null;
}
```

or define the correct type and validate the data.

---

# 7. Error Handling

Errors must be handled intentionally.

Do not:

```ts
try {
  await operation();
} catch {
}
```

Do not silently swallow exceptions.

Do not use generic error handling that hides the actual failure.

Prefer meaningful handling:

```ts
try {
  await operation();
} catch (error) {
  // Log/report the error appropriately.
  throw new Error("Failed to complete operation.", {
    cause: error,
  });
}
```

Preserve the original error context whenever possible.

Do not expose sensitive internal information to users.

---

# 8. Security

Follow secure coding practices by default.

Always consider:

* Authentication
* Authorization
* Input validation
* Injection attacks
* XSS
* CSRF where applicable
* Sensitive information exposure
* Insecure direct object references
* Improper access control
* Secrets exposure
* Unsafe file operations
* Unsafe redirects
* Dependency vulnerabilities

Never trust client-side authorization alone.

For Convex functions, authorization must be enforced on the server side where required.

Never place:

* API keys
* Tokens
* Passwords
* Private credentials
* Connection strings
* Secrets

directly in source code.

---

# 9. Database / Convex Performance

Avoid unnecessary database operations.

Before adding database logic, consider:

* Can this query be narrowed?
* Is an index required?
* Are we fetching unnecessary records?
* Are we performing repeated reads?
* Can operations be combined?
* Is there an N+1 pattern?
* Can computation happen outside the database?
* Is the data relationship correct?

Do not optimize blindly.

Measure and understand the existing data flow before introducing complex optimizations.

---

# 10. React / Next.js Standards

Follow modern React and Next.js best practices.

Avoid:

* Unnecessary client components
* Excessive `useEffect`
* Derived state stored unnecessarily
* Prop drilling when a better architecture exists
* Duplicate API calls
* Unnecessary re-renders
* Large monolithic components
* Business logic embedded directly inside JSX

Keep responsibilities separated:

```text
UI
↓
Presentation logic
↓
Application/business logic
↓
Data access
```

Do not move everything into hooks simply because it is possible.

Use the simplest architecture appropriate for the feature.

---

# 11. React Component Quality

Components should have one clear responsibility.

Avoid components that simultaneously handle:

* Complex data fetching
* Business rules
* Validation
* Database operations
* Formatting
* Large amounts of JSX
* Multiple unrelated UI concerns

Break them down only when doing so improves readability and maintainability.

Do not create unnecessary component fragmentation.

---

# 12. Constants and Magic Values

Avoid unexplained magic numbers and strings.

Bad:

```ts
if (status === 3) {
  ...
}
```

Prefer:

```ts
const COMPLETED_STATUS = 3;

if (status === COMPLETED_STATUS) {
  ...
}
```

Even better when appropriate:

```ts
if (status === BookingStatus.Completed) {
  ...
}
```

Use domain-specific constants/enums when they improve readability.

---

# 13. Comments

Comments should explain **why**, not restate **what** the code already says.

Bad:

```ts
// Increment counter
counter++;
```

Good:

```ts
// The external service occasionally returns duplicate events,
// so only the first event should increment the counter.
counter++;
```

If code requires a long comment to explain what it does, first consider whether the code itself should be improved.

Never use comments to justify bad architecture.

---

# 14. Suppression Rules

Do not use:

```ts
// NOSONAR
```

or equivalent suppression mechanisms merely to bypass a quality issue.

Do not use:

```ts
@ts-ignore
eslint-disable
eslint-disable-next-line
```

unless there is a legitimate, documented reason.

When suppression is genuinely unavoidable:

1. Understand the rule.
2. Confirm there is no reasonable implementation alternative.
3. Keep the suppression as narrow as possible.
4. Add a concise explanation when necessary.

Never suppress an issue simply because it is inconvenient to fix.

---

# 15. Testing Standards

For meaningful business logic, consider tests for:

* Happy paths
* Invalid inputs
* Boundary conditions
* Authorization failures
* Empty states
* Error states
* Regression scenarios
* Important business rules

Do not write tests solely to increase coverage percentages.

Tests should protect actual behavior and prevent regressions.

---

# 16. Dependency Standards

Before adding a dependency:

1. Check whether the project already provides the functionality.
2. Check whether an existing dependency can solve the problem.
3. Consider bundle size and runtime impact.
4. Consider security and maintenance.
5. Avoid dependencies that solve trivial problems.

Do not introduce a library for functionality that can be implemented clearly with a few lines of existing project code.

---

# 17. Architecture Standards

Respect existing architecture.

Before introducing a new pattern:

1. Inspect existing implementations.
2. Understand why the current architecture exists.
3. Reuse established project conventions.
4. Avoid introducing competing patterns.
5. Keep responsibilities separated.

Do not rewrite working architecture unnecessarily.

Prefer **incremental, targeted changes** over large refactors unless the task explicitly requires a refactor.

---

# 18. Minimal Change Principle

When fixing a bug:

```text
Understand → Isolate → Fix → Validate
```

Do not modify unrelated files.

Do not refactor unrelated code while fixing a small issue.

Do not change public behavior unless required.

Do not introduce unnecessary dependencies.

Do not rewrite an entire module when a focused fix is sufficient.

---

# 19. Code Review Before Completion

Before considering an implementation complete, mentally perform a senior-level code review.

Check:

### Correctness

* Does it solve the requested problem?
* Does it preserve existing behavior?
* Are edge cases handled?

### Maintainability

* Is the code easy to understand?
* Are responsibilities separated?
* Is duplication minimized?
* Is complexity reasonable?

### Security

* Is authorization enforced?
* Is user input validated?
* Could sensitive information leak?

### Performance

* Are database operations efficient?
* Are unnecessary renders or requests introduced?
* Are expensive operations repeated?

### Reliability

* Are errors handled correctly?
* Are failures observable?
* Are partial-failure scenarios considered?

### SonarQube

Check for likely:

* Bugs
* Vulnerabilities
* Security hotspots
* Code smells
* Duplications
* Cognitive complexity
* Maintainability issues
* Reliability issues

---

# Graphify Context

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
5. Apply SonarQube-quality engineering standards.
6. Implement the smallest safe change.
7. Validate the affected functionality.
8. Run the production build.
9. Refresh Graphify context if necessary.
```

Do not assume a relationship exists merely because Graphify suggests it. Verify important relationships against the actual source code.

---

# UI/UX Rules

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

UI implementation must also follow the same SonarQube-quality standards described above.

---

# Required Validation

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

When SonarQube is configured in the project, also run the project's configured SonarQube/SonarScanner command and resolve actionable findings.

Do not treat warnings as automatically ignorable.

---

# Production-Ready Requirement

Before declaring the task complete, verify that:

* The application builds successfully.
* There are no TypeScript/build errors.
* Convex code follows the project guidelines.
* SonarQube-quality standards are satisfied.
* No new obvious bugs, vulnerabilities, or code smells were introduced.
* No unnecessary code duplication was introduced.
* Cognitive complexity remains reasonable.
* Error handling is intentional.
* Input validation is present where required.
* Authorization/security boundaries are preserved.
* UI/UX requirements are satisfied.
* No obvious runtime or validation issues were introduced.
* Existing functionality has not been unnecessarily broken.
* Relevant Graphify context has been inspected for significant changes.
* Important architectural/dependency assumptions have been verified against the actual source code.
* The implementation is maintainable by another experienced developer.

Only declare the implementation complete when the project is in a **production-ready state**.

<!-- convex-ai-end -->

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
