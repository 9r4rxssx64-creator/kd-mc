# Roadmap

Meridian OS is pre-first-push. The roadmap is organized around making the local-first company OS real, testable, and safe before expanding into hosted or multi-tenant modes.

## Now

| Area | Work |
| --- | --- |
| Kimi session continuity | Add CLI session resume support with `kimi -r` so Kimi Space can preserve context across local replies. |
| Persistence | Replace the in-memory store with a SQLite-backed persistence layer for companies, agents, tasks, goals, approvals, activity, and ledger entries. |
| Tests | Add Vitest coverage for reducers, selectors, Kimi command parsing, and simulation behavior; add Playwright coverage for the main operating flows. |
| CI | Add GitHub Actions for typecheck, production build, and policy greps that catch token leakage, raw color usage, and unsafe middleware changes. |

## Next

| Area | Work |
| --- | --- |
| Adapter layer | Move beyond chat into real task execution through local CLIs, with workspace sync and structured result capture. |
| Ledger integration | Parse runtime cost and token usage into the finance ledger instead of relying on simulation accrual. |
| Additional runtimes | Add `claude-local`, `codex-local`, and `opencode` adapters behind the same runtime contract. |
| Mobile layout | Do a full mobile pass for the shell, sidebar, drawers, tables, and dense operator views. |
| Approval quorum | Add quorum rules for approvals that require multiple human or role-based sign-offs. |

## Later

| Area | Work |
| --- | --- |
| Multi-tenant server mode | Add a server-backed deployment model for teams that want hosted shared state. |
| SSO | Support enterprise identity providers for hosted or private deployments. |
| Plugin SDK | Let third parties package new views, runtime adapters, policy checks, and skill packs. |
| Hosted control plane | Offer a managed Meridian deployment for companies that do not want to run their own infrastructure. |

## Principles

- Local-first before hosted.
- Governance before autonomy.
- Ledger-backed execution before vanity charts.
- Real adapters before simulated confidence.
- Operator control before agent convenience.
