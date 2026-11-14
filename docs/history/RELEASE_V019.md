# NEXUS v0.19.0 — first validated-scope increment

Implemented:
- Model/account registry from actual configured profiles, CLI auth checks, Claude Status Line quota, and Codex cooldown blocks.
- Registry explicitly labels model access unverified; Codex default model is not invented.
- Adaptive read-only step runner retries up to three distinct accounts on subscription-limit errors only; prioritizes same provider, then other provider.
- Limit blocks apply to both Codex and Claude; no automatic retry on arbitrary errors.
- Project/chat storage from v0.17.2 retained.

Not implemented:
- AI-generated task graph (current planner is heuristic).
- Automatic multi-step orchestration, model-specific probing, real token accounting, Git worktrees, parallel execution, tests or self-repair.
- Codex real-time quota retrieval.
- Unattended Claude quota updates outside active Claude Code sessions.

Security:
- Runs tasks read-only, stdin closed. Existing workspace must be an existing directory.
- On limit errors only, failover is safe to retry because tasks do not modify files.
- No verified macOS build in this environment. Build/test on target Mac before relying on it.
