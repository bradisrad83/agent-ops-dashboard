# Agent Ops Dashboard — Spec (v0)

This repo contains:

- `/package`: NPM library (Vue 3) that renders an Agent Ops Dashboard UI
- `/playground`: demo app consuming the library via workspace dependency

The UI is backend-agnostic. Backends integrate by implementing the API + event schema below.

---

## Core Concepts

### Run

A _Run_ is a top-level execution triggered by a user prompt (or a system action).

- A run contains many events.
- A run may have many agents participating.

### Agent

An _Agent_ is a named worker (orchestrator, planner, builder, reviewer, etc.)

- Agents emit events.
- Agents may execute tools.
- Agents may produce artifacts.

### Event

An _Event_ is an append-only record describing something that happened.

- The UI is driven entirely by an event stream.
- Events are immutable once written.

### Event type naming

Use dotted namespaces (examples): `run.started`, `tool.called`, `tool.result`, `artifact.produced`, `run.completed`, `error`.

### Artifact

An _Artifact_ is a produced/consumed resource (file, diff, link, JSON, etc.)

- Artifacts are represented via events (e.g., `artifact.produced`).
- The UI may show "Consumed" and "Produced" panels derived from these events.

---

## Event Schema (required)

All events MUST conform to this shape:

```ts
type AgentOpsEvent = {
  id: string; // unique event id
  ts: string; // ISO-8601 timestamp
  runId: string; // run identifier
  agentId?: string; // optional (system events may omit)
  taskId?: string; // optional task/work unit id
  type: string; // dotted namespace type, e.g. "tool.called"
  level?: "debug" | "info" | "warn" | "error";
  payload: Record<string, any>; // event-specific fields
};
```
