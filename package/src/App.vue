<script setup lang="ts">
import AgentOpsDashboard from "./components/AgentOpsDashboard.vue";
import { createApiProvider } from "./providers/ApiProvider";

const provider = createApiProvider({
  baseUrl: "http://localhost:8787",
  // apiKey: "..." // only if you enabled AGENTOPS_API_KEY
});
</script>

<template>
  <div style="height: 100vh;">
    <AgentOpsDashboard :provider="provider" />
  </div>
</template>
