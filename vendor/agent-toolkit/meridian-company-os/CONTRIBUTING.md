# Contributing To Meridian OS

Thanks for helping build Meridian OS. This project is a company-OS web app for operating teams of humans and AI agents, so contributions should preserve the feeling of a dense, live, governed control plane.

## Setup

Requirements:

- Node 20+
- Optional: Kimi Code CLI installed at `~/.kimi-code/bin/kimi` and logged in with `kimi login`

Run locally:

```bash
npm install
npm run dev
```

Build before opening a pull request:

```bash
npm run build
```

Preview a production build:

```bash
npm run preview
```

## Conventions

Read [ARCHITECTURE.md](ARCHITECTURE.md) before writing or changing a view.

Core rules:

- Use design tokens only. Colors, spacing, radius, and type come from CSS variables in `src/styles/tokens.css`.
- Use shared primitives from `src/components/primitives.tsx` and shared classes from `src/styles/app.css`.
- Use `lucide-react` icons. Do not hand-draw SVG icons.
- Machine values are mono: costs, tokens, IDs, timestamps, percentages, and codes.
- Use the existing status vocabulary: `working`, `idle`, `paused`, `blocked`, `offline`, task statuses from `backlog` to `done`, and priorities `p0` to `p3`.
- Keep views pure over store state. The simulation engine already ticks; views should not create their own data intervals.
- Avoid dead UI. Every button should dispatch an action, open a detail surface, change local state, or perform a clear browser action.

## Adding A View

1. Create `src/views/<Name>.tsx` and export a named `<Name>View` component.
2. Create `src/views/<name>.css` and import it from the view.
3. Add the view id to `ViewId` in `src/lib/types.ts`.
4. Wire the nav label, icon, and render branch in `src/App.tsx`.
5. Use `useStore()` plus selectors from `src/lib/store.tsx`.
6. Support deep links from selected state when relevant, such as `state.selectedTaskId` or `state.selectedAgentId`.
7. Keep derived lists memoized with narrow dependencies when a live tick can rerender the view.

## Adding A Store Action

1. Add the action shape to `Action` in `src/lib/types.ts`.
2. Implement the reducer branch in `src/lib/store.tsx`.
3. Treat state as immutable: copy only the slices you change.
4. Add an activity event when the action changes operating history.
5. Add a toast when the user needs immediate confirmation.
6. Keep action names specific and stable; they are part of the OS command surface.

## Kimi Runtime Changes

The Vite middleware in `vite.config.ts` has two Kimi paths:

- `kimiOAuthProxy` for RFC 8628 device-flow calls to `auth.kimi.com`.
- `localKimiBridge` for local CLI calls through `~/.kimi-code/bin/kimi`.

Do not return credentials or tokens from middleware endpoints. Preserve the one-at-a-time local chat guard, the 8k input cap, the 180-second timeout, and the dedicated `.kimi-runtime` workdir unless a security review explicitly changes the model.

## Pull Requests

Before submitting:

- `npm run build` must pass.
- UI changes should include screenshots, preferably from the affected view.
- Document security-relevant changes in the PR description.
- Keep PRs focused. Separate design-system changes, runtime changes, and data-model changes when possible.
- Call out any local-runtime behavior that could affect credentials, shell execution, network access, or stored browser state.

Commit messages should be short, imperative, and scoped to the change, for example:

```text
Add finance projection drawer
Harden local Kimi status parsing
Document approval policy checks
```
