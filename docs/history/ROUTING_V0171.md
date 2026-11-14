# NEXUS 0.17.1 — quota-aware routing

- Planner checks CLI authentication and Claude Status Line per profile; excludes exhausted weekly quota until reset.
- Unknown and stale quota are explicitly labeled and ranked below fresh available accounts; they are not guaranteed usable.
- Re-checks candidates immediately before each read-only step; switches to another profile if original became unavailable.
- If CLI returns a subscription-limit error, marks the Claude profile blocked and tells user to regenerate plan. Does **not** automatically repeat a potentially expensive task (avoids double execution).
- Codex quota is not yet integrated into routing; marked unknown.
- Model-tier selection remains heuristic; no token-cost telemetry or fully automatic orchestration.
- No macOS build was performed in this environment.
