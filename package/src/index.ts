import AgentOpsDashboard from "./components/AgentOpsDashboard.vue";
import "./styles/base.css";

// Component exports
export { AgentOpsDashboard };
export default AgentOpsDashboard;

// Provider exports
export { mockProvider } from "./client/mockProvider";
export { createSSEProvider, sseProvider } from "./client/sseProvider";

// Type exports
export type {
  AgentOpsEvent,
  EventType,
  EventLevel,
  AgentId,
} from "./types/events";

export type {
  EventStreamProvider,
  EventStreamOptions,
  EventStreamControl,
} from "./client/provider";
