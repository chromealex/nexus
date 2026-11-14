# NEXUS v0.19.1 — AI Planner and dependent step context

This incremental build adds:
- **AI plan** button. Uses a quota-aware selected account (Claude Opus if Claude is eligible; otherwise default Codex) to produce a validated JSON plan of 1–12 read-only steps.
- **Rule-based plan** remains as fallback.
- **Dependency context**: completed prerequisite step outputs are passed (truncated to 3,500 characters per dependency and 14 KB total) to subsequent steps.
- Existing account failover, project chats and Status Line quota collection are preserved.
- The AI planner does not write to the project. Step execution remains read-only, with quota failover handled by the existing scheduler.
- Plans are displayed for review; users manually launch each step.
- No autonomous DAG scheduler, parallel execution, model capability discovery, write operations, Git worktrees, or verified token cost accounting in this build.
- AI planner itself currently fails with a clear error on subscription limit; retry AI plan to use another eligible account. No automatic planner failover.
- Existing chat history is persisted but not automatically injected into the AI planner.

**Not tested on macOS:** Rust/Tauri compilation and real CLI behavior require local verification.
