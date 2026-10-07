# Coding Rules

## General

* Use TypeScript.
* Avoid `any`.
* Prefer explicit types.
* Keep functions focused.
* Keep components small and composable.
* Separate business logic from presentation.
* Avoid premature abstractions.
* Avoid unnecessary dependencies.
* Do not duplicate business logic.

## React

* Prefer functional components.
* Keep server/client boundaries intentional.
* Do not add `"use client"` unless required.
* Avoid unnecessary global state.
* Prefer local state for local UI behavior.

## Error Handling

* Never silently swallow errors.
* Do not use empty catch blocks.
* Preserve actionable error information.
* User-facing errors must be understandable.

## Changes

Before introducing a new abstraction, determine whether an existing utility/component/service can be reused.

Do not refactor unrelated code during feature implementation unless required for correctness.

## Verification

After meaningful changes:

1. run tests;
2. run typecheck;
3. run lint;
4. verify the relevant acceptance criteria.

Never weaken or remove tests merely to make them pass.
