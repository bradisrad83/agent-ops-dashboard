<script setup lang="ts">
import { ref, onMounted } from 'vue';
import AgentOpsDashboard from "./components/AgentOpsDashboard.vue";
import { createApiProvider } from "./providers/ApiProvider";

const provider = createApiProvider({
  baseUrl: "http://localhost:8787",
  // apiKey: "..." // only if you enabled AGENTOPS_API_KEY
});

const initialRunId = ref<string | undefined>(undefined);

onMounted(() => {
  const params = new URLSearchParams(window.location.search);
  const runId = params.get('runId');
  if (runId) {
    initialRunId.value = runId;
  }
});
</script>

<template>
  <div style="height: 100vh;">
    <AgentOpsDashboard :provider="provider" :initial-run-id="initialRunId" />
  </div>
</template>
