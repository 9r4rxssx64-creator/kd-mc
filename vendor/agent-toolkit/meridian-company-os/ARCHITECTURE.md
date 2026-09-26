# Meridian OS - build conventions (read before writing any view)

Meridian is a **Company OS**: an operational control plane for running companies
of humans + AI agents. The user is an operator. Every screen answers, in order:
*what is happening, does it need me, what do I do about it.*

## Stack

- React 19 + TypeScript + Vite. No router lib, no chart lib, no state lib.
- State: `useStore()` from `src/lib/store.tsx` -> `{ state, dispatch }`.
- Icons: `lucide-react` (size 13-16 in dense UI). Never hand-draw SVG icons, never emoji.

## File ownership

- Your view file: `src/views/<Name>.tsx` (export a named `<Name>View` component).
- Your styles: `src/views/<name>.css`, imported from your view file.
- DO NOT edit: `src/styles/app.css`, `src/styles/tokens.css`, `src/lib/*`,
  `src/components/*`, `src/App.tsx`, `src/main.tsx`, other views.

## Design rules (non-negotiable)

1. **Tokens only.** Colors/spacing/radius/type come from CSS vars in
   `src/styles/tokens.css` (`--bg-1`, `--tx-1`, `--line`, `--accent`,
   `--st-working`, `--sp-4`, `--r-md`...). No raw hex in components, no px
   font sizes, no Tailwind.
2. **Shared classes exist - use them.** From `src/styles/app.css`: `.page`,
   `.page-head`, `.panel` (or the `<Panel>` component), `.btn` (`.primary`,
   `.danger`, `.ghost`, `.sm`), `.badge` (+status tones), `.table`, `.stat`,
   `.progress`, `.seg`, `.empty`, `.drawer` (+`.drawer-scrim`), `.row`,
   `.grow`, `.muted`, `.tiny`, `.mono`, `.ellip`, `.kbd`.
3. **Shared components** from `src/components/primitives.tsx`: `<Avatar>`,
   `<StatusBadge>`, `<Badge>`, `<Progress>`, `<Sparkline>`, `<Panel>`,
   `<Empty>`, `<KV>`.
4. **Machine values are mono.** Costs, tokens, IDs, timestamps, percentages:
   wrap in `.mono`, format via `src/lib/format.ts` helpers (`fmtMoney`,
   `fmtMoneyExact`, `fmtNum`, `fmtPct`, `relTime`, `fmtClock`, `fmtDate`).
5. **Status vocabulary is one thing.** working/idle/paused/blocked/offline,
   task statuses backlog->done, priorities p0-p3. Use existing badge tones;
   don't invent new colors for existing meanings.
6. **Density from information, not chrome.** Borders justify themselves. Cards
   don't nest inside cards. Page sections use `.panel` or bare structure.
7. **Interactive states.** Rows that open drawers get `.clickable` + hover.
   Buttons `:active` press is already global. Loading/empty states via
   `<Empty>`.
8. **No emojis, no Inter, no purple/blue gradients, no neon glows, no pure
   black, no one-note palette.** Accent (emerald) is for primary actions and
   positive signal only.

## Data model quick reference (`src/lib/types.ts`)

- `state.companies[id]` -> Company (budgets[], ledger[], northStar, mission)
- `state.agents[id]` -> Agent (status, title, department, runtime, model,
  managerId, monthlyBudget, spent, successRate, tasksCompleted, skills[],
  heartbeat, color, lastHeartbeat)
- `state.goals[id]` -> Goal (level mission/company/team, parentId, krs[])
- `state.tasks[id]` -> Task (code, status, priority, assigneeId, goalId,
  delegatedBy, progress 0..1, cost, tokens, thread[], toolCalls[], dueAt)
- `state.approvals[id]` -> Approval (type, status, checks[], diff[], amount,
  rationale)
- `state.activity` -> ActivityEvent[] (newest first; filter by companyId)
- Selectors exported from store: `companyAgents(s,id)`, `companyTasks(s,id)`,
  `companyGoals(s,id)`, `companyApprovals(s,id)`, `agentName(s,id)`,
  `useCompany()`.
- Useful dispatches: `navigate {view}`, `selectAgent {id}`,
  `selectTask {id}`, `decideApproval {id, approve}`, `pauseAgent/resumeAgent`,
  `moveTask {id, status}`, `palette {open}`, `addToast`.
- `state.selectedAgentId` / `state.selectedTaskId` may be set on entry (deep
  link from palette or another view) - honor them on mount (open the drawer).

## Simulation

The store ticks every ~2.6s: spends accrue, tasks advance, activity grows.
Views must be pure renders of state - never mutate, never useEffect-interval
your own data. A re-render every tick must stay cheap (memoize heavy derived
lists with useMemo keyed on the narrowest slice).

## Quality bar

`npm run build` (tsc strict + vite) must pass. Views must be fully wired:
every button does something real (dispatch or local state), every row opens
detail, every filter works. No dead UI, no lorem ipsum, no placeholder text.
