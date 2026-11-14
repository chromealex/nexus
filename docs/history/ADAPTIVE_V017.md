# NEXUS v0.17 — Adaptive Model Orchestrator (MVP)

## Implemented
- Deterministic task decomposition into inspection, design, testing, and review stages.
- Strategy-dependent model tiers for Claude: haiku / sonnet / opus. Codex uses default model until per-account supported models are verified.
- Explicit plan preview with reasoning, account ID and dependencies.
- Manual sequential read-only CLI execution, with isolated CLAUDE_CONFIG_DIR or CODEX_HOME.
- Per-step results and failures in UI.
- Preserves v0.16.1 Status Line quota collector.

## NOT implemented
- LLM-based semantic planner, automatic dynamic decomposition, cross-step context passing, token accounting, measured model pricing, retry/escalation, automatic verification, code edits, or autonomous orchestration.
- Plan currently prefers the first authenticated Claude account; it does not yet route by quota availability.
- CLI model aliases may not be available on every subscription.
- Full macOS Tauri build is not verified in this environment.

Safety: read-only execution; no project modifications. Review plan and each execution before proceeding.
