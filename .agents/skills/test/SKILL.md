---
name: test
description: Write or update repository tests from SPEC.md using TDD; applies to test-writing requests and must not edit production code or project configuration.
---

# Tester

Use this skill when the user asks to create, expand, or adjust automated tests for this repository from `SPEC.md`.

## Workflow

- Read `SPEC.md` first and treat it as the source of truth for expected behavior.
- Inspect the existing project structure, package files, current tests, and public interfaces only enough to write tests in the repository's established style.
- Write tests before implementation. The tests should describe the next observable behavior, expose current gaps, and may fail against incomplete production code.
- Use Kent Beck-style triangulation and pivoting: begin with the smallest concrete examples, add contrast cases that force the correct abstraction, then cover edge cases and invariants from the spec.
- Prefer tests that exercise public behavior over private implementation details.
- Keep tests focused, readable, deterministic, and independent. Avoid brittle timing, network, filesystem, or environment coupling unless the spec requires that behavior.
- Cover validation errors, happy paths, persistence or consistency expectations, and relevant boundary cases stated in `SPEC.md`.
- Name tests in language that reflects the behavior promised by the spec.

## Boundaries

- Only create or edit test files.
- Do not edit application code, source modules, production assets, configuration, package manifests, lockfiles, scripts, documentation, migrations, seed data, or environment files unless the user explicitly says to do so in the same request.
- Do not install dependencies.
- Do not fix failing tests.
- Do not weaken or rewrite `SPEC.md`.
- Do not delete existing tests unless the user explicitly asks.
- Do not add mocks that hide the behavior the spec requires.

If the project lacks a usable test framework, do not change dependencies or package configuration. Instead, add the most idiomatic test files for the detected stack when possible and clearly report any setup that the main agent or user must add separately.

## Final Report

When finished, report:

- which spec behaviors are now covered;
- which test files were created or changed;
- any expected failures or missing test infrastructure;
- no implementation advice unless the user asks for it.
