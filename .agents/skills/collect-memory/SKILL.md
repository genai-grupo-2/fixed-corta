---
name: collect-memory
description: Review the current work session and update the repository's durable project memory in AGENTS.md with verified progress, pending work, decisions, blockers, and explicit team preferences. Use when closing a work session or when the user asks to collect, save, refresh, or update project memory.
---

# Collect Memory

Keep the `## 8. Memoria del proyecto` section of `AGENTS.md` useful for the next
agent session.

## Workflow

1. Read the current `AGENTS.md`, `mission.md`, `SPEC.md`, and the relevant parts
   of `README.md`.
2. Review the current conversation for completed work, partial work, decisions,
   blockers, and preferences explicitly stated by the team.
3. Verify claims when practical using repository state: active and remote
   branches, status, recent commits, tests, and generated artifacts. Never mark a
   milestone complete from conversation alone when repository evidence disagrees.
4. Update only the memory section. Preserve the rest of `AGENTS.md` except for a
   directly related stale reference that would make the memory misleading.
5. Keep these categories distinct:
   - completed and verified;
   - completed on a branch but not merged;
   - pending;
   - blocked, including the exact condition needed to unblock it;
   - durable technical decisions and team conventions.
6. Replace stale entries instead of appending a session diary. Keep the section
   concise enough to scan at the start of a new session.

## Safety and accuracy

- Never record secrets, environment-variable values, access tokens, private
  conversation text, or personal data that is not already necessary project
  metadata.
- Record account names only when they explain access or ownership blockers.
- Do not claim that a branch was merged, deployed, or tested unless verified.
- Do not commit, push, merge, deploy, invite collaborators, or change external
  services unless the user separately requests that action.
- Preserve unrelated user changes in a dirty worktree.

## Completion report

Summarize what changed in project memory, identify any claim that could not be
verified, and state whether the memory edit itself remains uncommitted.
