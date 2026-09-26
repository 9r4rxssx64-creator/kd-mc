# Meridian OS

An open-source company OS for running teams of humans and AI agents from one operational console.

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![React 19](https://img.shields.io/badge/React-19-149eca.svg)](package.json)
[![TypeScript strict](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)](tsconfig.json)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-2ea44f.svg)](CONTRIBUTING.md)

Meridian OS is an operational control plane for companies made of humans and AI agents. 

![Command view](docs/assets/01-command.png)

## Why

Agent orchestration is not enough to run a company. A company OS needs to know who owns what, which goals matter, what work is blocked, how fast tokens and dollars are burning, what approvals are pending, and what happened after the operator closed the tab.

Meridian brings those surfaces into one live system. The result is less "chat with an agent" and more "talk to the company, inspect its state, and approve the moments that matter."

## Features

| View | What it does |
| --- | --- |
| Command | Operator cockpit with north-star metrics, risk radar, pending approvals, department envelopes, and live heartbeat feed. |
| Kimi Space | Chat with agents; OS commands create tasks, assign work, move statuses, install skills, and route free-form chat to local Kimi when available. |
| Work | Kanban and list modes with filters, priorities, goal alignment, delegation context, thread history, and tool-call traces. |
| Goals | Mission -> company -> team alignment tree with key results and owner context. |
| Org Chart | Recursive company tree with agent dossiers and reporting lines. |
| Agents | Sortable scoreboard for runtime, status, budget, success rate, throughput, and installed skills. |
| Skills | Installable capability packs credited to their sources, with category metadata and runtime toggles. |
| Approvals | Governance inbox for spend, hire, override, publish, and terminate decisions with policy checks. |
| Finance | Burn charts, department envelopes, projections, and model/token ledger. |
| Activity | Immutable audit log of heartbeats, decisions, delegation, spend, and system events with JSON export. |
| Reports | Auto-generated CEO briefs from the current operating state. |
| Portfolio | Multi-company overview for switching between operating companies. |

More operating surfaces:

| Work | Approvals | Finance |
| --- | --- | --- |
| ![Work kanban](docs/assets/04-work.png) | ![Approvals inbox](docs/assets/06-approvals.png) | ![Finance view](docs/assets/07-finance.png) |

## The Company Is Alive

Meridian ships with a simulation engine that ticks about every 2.6 seconds. While it is running, AI agents send heartbeats, tasks advance, token counts grow, budget lines accrue spend, and the audit log keeps recording activity.

The simulation can be paused from the sidebar. Without any real runtime connected, Meridian still behaves like a live company console, which makes it useful for design, demos, and product development.

## Talk To Your Company

Kimi Space is the operator chat surface. It understands OS commands such as:

```text
create task: refresh onboarding emails, assign to Bea, p1
assign HAL-1042 to Ingrid
move HAL-1042 to review
install Context7 on Juno
budget report
```

When a command resolves, Meridian dispatches a real store action. When no command matches and the local Kimi runtime is ready, Meridian calls the user's local `kimi` CLI and shows the model reply with a trace.

![Kimi Space with local reply](docs/assets/51-space-localreply.png)

## Quickstart

Requirements:

- Node 20+
- Optional for real local chat: Kimi Code CLI installed at `~/.kimi-code/bin/kimi` and logged in with `kimi login`

Install and run:

```bash
npm install
npm run dev
```

Open the Vite app on port `4173`. Build and preview:

```bash
npm run build
npm run preview
```

### Connect A Real Agent

Meridian has two Kimi integration paths.

| Path | What it does | Requirements |
| --- | --- | --- |
| Local runtime | Vite middleware spawns the user's local Kimi Code CLI with `kimi -p`, using the user's own stored OAuth credentials. Non-command chat in Kimi Space is answered by the real k3 model. | `~/.kimi-code/bin/kimi` exists and `kimi login` has completed. |
| OAuth device flow | Optional RFC 8628 card that connects through a Vite proxy to `auth.kimi.com`. The client id follows the public opencode integration. | User completes the device-code flow in the browser. |

Local runtime endpoints:

```text
GET  /local-runtime/status
POST /local-runtime/kimi/chat
```

Safety properties:

- One local Kimi chat runs at a time.
- Chat messages are capped at 8k characters.
- Calls time out after 180 seconds.
- The bridge uses a dedicated `.kimi-runtime` workdir.
- Tokens are never returned by any endpoint.

The Kimi Space header shows a `local runtime` badge when the local CLI path is ready. If the runtime is missing, Meridian keeps working in simulation mode.

OAuth proxy endpoints:

```text
POST /kimi-oauth/device
POST /kimi-oauth/token
```

The OAuth connection status is persisted in `localStorage`, but the device code and tokens are not persisted by the client.

## Architecture

```text
src/
  App.tsx                 shell, navigation, company switcher, simulation toggle
  components/             shared primitives, command palette, Kimi connection card
  lib/
    store.tsx             reducer, selectors, simulation engine, localStorage persistence
    types.ts              company, agent, goal, task, approval, activity, Kimi types
    seed.ts               seeded multi-company operating world
    skills.ts             installable skill registry
    kimiAuth.ts           client for the device-flow OAuth proxy
  styles/                 token-driven global CSS and app primitives
  views/                  Command, Kimi Space, Work, Goals, Org, Agents, Skills,
                          Approvals, Finance, Activity, Reports, Portfolio
vite.config.ts            React plugin plus Kimi OAuth proxy and local Kimi bridge
```

Middleware bridge:

```text
Kimi Space
   |
   | same-origin fetch
   v
Vite middleware
   |---------------------> /kimi-oauth/* -> auth.kimi.com
   |
   | local process spawn
   v
~/.kimi-code/bin/kimi -p
   |
   v
.kimi-runtime workdir + user's stored Kimi credentials
```

The frontend is React 19 with strict TypeScript, Vite 6, and no runtime dependencies except `lucide-react`. The visual system is a dark ops-console UI using Geist and Geist Mono, token-driven CSS, shared primitives, one status vocabulary, and mono text for machine values.

Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing views or shared patterns.

## Security

Meridian is local-first. The most sensitive path is the development middleware that can spawn the user's local Kimi CLI; it is designed for user-consented local development, does not expose tokens through API responses, serializes local Kimi chats, caps input size, and uses a dedicated workdir.

See [SECURITY.md](SECURITY.md) for the threat model, supported versions, and reporting process.

## Roadmap

The first push focuses on hardening the local runtime, persistence, tests, and CI. Next comes a real adapter layer for task execution, more local runtimes, stronger approvals, and a mobile layout pass.

See [ROADMAP.md](ROADMAP.md) for the Now/Next/Later plan.

## Contributing

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), keep `npm run build` green, and include screenshots for UI changes.

## License

Meridian OS is released under the [MIT License](LICENSE).
