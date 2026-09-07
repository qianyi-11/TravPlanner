# Travel Planner — Shared Cloud Function Contracts

Canonical path:

```text
travel-planner/shared/contracts/
```

## Purpose

- `shared/schemas/` defines persisted domain/document structure.
- `shared/contracts/` defines callable Cloud Function request/response structure.

Both frontend and backend import these contracts.

## Required root export

Add to:

```text
travel-planner/shared/index.ts
```

```ts
export * from "./contracts";
```

## Schema patch

This package also contains two new persisted schema files required by the finalized Data Model:

```text
shared/schemas/criticalFactProposal.ts
shared/schemas/reviewDraft.ts
```

Add them to `shared/schemas/index.ts`:

```ts
export * from "./criticalFactProposal";
export * from "./reviewDraft";
```

## Important

Zod validates request shape. It does not replace:

- Firebase Auth checks;
- active membership checks;
- OWNER authorization;
- phase guards;
- planning-cycle/version concurrency;
- cross-document business rules;
- Firestore transactions;
- Validator checks.
