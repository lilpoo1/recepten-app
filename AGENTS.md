# Repository Guidelines

## Project Structure & Module Organization

This is a strict TypeScript and Next.js 16 App Router application. Routes live in `app/`; dynamic routes use folders such as `app/recipes/[id]/`. Put reusable UI in `components/`, shared state in `context/`, and domain or integration code in `lib/`. Shared types belong in `types/`, static and generated PWA assets in `public/`, and tests in `tests/`. Operational scripts, recovery documentation, and backup infrastructure live in `scripts/`, `docs/`, and `infra/`.

## Development & Quality Commands

- `npm ci` installs the locked dependencies.
- `npm run dev` starts the app at `http://localhost:3000`.
- `npm run test:unit` runs pure domain and utility tests.
- `npm run test:integration` runs React, IndexedDB, datasource, and Firestore emulator tests.
- `npm test` runs both required test suites.
- `npm run lint` checks Next.js and TypeScript conventions.
- `npm run build` creates and type-checks the production build.

After every code or configuration update, run both `npm run test:unit` and `npm run test:integration`. Do not report work as complete unless both pass. For changes affecting production code, configuration, or bundling, also run lint and build.
Use Node.js 20.9+ and Java 21+; the Firestore emulator must not be run on an older JDK.

## Coding Style & Maintainability

Always write maintainable, industry-standard code. Keep strict types and explicit interfaces, prefer small focused modules, reuse shared behavior instead of duplicating it, and handle expected failures explicitly. Avoid unnecessary abstractions and keep route-specific code near its route. Use 2-space indentation, semicolons, double quotes, `PascalCase` for components and types, `camelCase` for functions and variables, and kebab-case for utility filenames. Prefer the `@/` root import alias. Do not manually edit generated service-worker files.

## Testing Guidelines

Use Vitest; use Testing Library and `user-event` for React behavior, `fake-indexeddb` for local persistence, and the Firebase emulator for security rules. Name unit tests `*.test.ts` and integration tests `*.integration.test.ts(x)`. Test observable behavior, failure paths, and regressions rather than implementation details. Security-rule changes must update `tests/firestore-rules.emulator.test.ts`. No percentage threshold is enforced.

## Commits, Pull Requests & Security

Use short imperative commits, for example `Improve Bring exports`. Pull requests should describe behavior, tests, Firebase or migration impact, linked issues, and UI screenshots when relevant. Never commit credentials or local environment files. Treat Firestore rules, backup scripts, and restore tooling as security-sensitive.
