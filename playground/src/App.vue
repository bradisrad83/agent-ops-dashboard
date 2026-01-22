<template>
  <div class="app-container">
    <div class="control-panel">
      <h2 class="control-panel-title">Control Panel</h2>

      <div class="control-grid">
        <!-- Provider Mode Selector -->
        <div class="control-field">
          <label class="control-label">Provider Mode</label>
          <select v-model="mode" class="control-input">
            <option value="mock">Mock</option>
            <option value="sse">SSE</option>
          </select>
        </div>

        <!-- Run ID Input -->
        <div class="control-field">
          <label class="control-label">Run ID</label>
          <input
            v-model="runId"
            type="text"
            placeholder="default"
            class="control-input"
          />
        </div>

        <!-- Mock Mode Settings -->
        <div v-if="mode === 'mock'" class="control-field">
          <label class="control-label">Interval (ms)</label>
          <input
            v-model.number="intervalMs"
            type="number"
            min="100"
            step="100"
            class="control-input"
          />
        </div>

        <!-- SSE Mode Settings -->
        <div v-if="mode === 'sse'" class="control-field">
          <label class="control-label">Base URL</label>
          <input
            v-model="baseUrl"
            type="text"
            placeholder="http://localhost:3000"
            class="control-input"
          />
        </div>

        <!-- Status Info -->
        <div class="status-info">
          <strong>Active:</strong> {{ mode === 'mock' ? 'Mock Provider' : 'SSE Provider' }}
          <span v-if="mode === 'sse'"> → {{ baseUrl }}</span>
        </div>
      </div>
    </div>

    <!-- Dashboard Component -->
    <AgentOpsDashboard
      :provider="computedProvider"
      :runId="runId"
      :intervalMs="intervalMs"
      :maxEvents="200"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import AgentOpsDashboard from 'agent-ops-dashboard'
import { mockProvider, createSSEProvider } from 'agent-ops-dashboard'
import 'agent-ops-dashboard/style.css'

const mode = ref<'mock' | 'sse'>('mock')
const runId = ref<string>('default')
const intervalMs = ref<number>(1000)
const baseUrl = ref<string>('http://localhost:3000')

const computedProvider = computed(() => {
  if (mode.value === 'mock') {
    return mockProvider
  } else {
    return createSSEProvider({ baseUrl: baseUrl.value })
  }
})
</script>

<style scoped>
/* Match the light theme from STYLEGUIDE.md */
.app-container {
  /* Design tokens matching the dashboard */
  --bg: #fafafa;
  --surface: #ffffff;
  --border: #e0e0e0;
  --text: #1a1a1a;
  --text-secondary: #525252;
  --muted: #737373;
  --accent: #2563eb;
  --accent-light: #dbeafe;
  --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;

  padding: 20px;
  font-family: var(--font-sans);
  background: var(--bg);
}

.control-panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 20px;
  margin-bottom: 20px;
}

.control-panel-title {
  margin: 0 0 16px 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text);
}

.control-grid {
  display: grid;
  gap: 16px;
}

.control-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.control-label {
  display: block;
  font-weight: 500;
  font-size: 13px;
  color: var(--text);
}

.control-input {
  width: 100%;
  height: 32px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 13px;
  font-family: var(--font-sans);
  color: var(--text);
  background: var(--surface);
}

.control-input::placeholder {
  color: var(--muted);
}

.control-input:focus {
  outline: none;
  border-color: var(--accent);
}

.control-input:hover {
  border-color: var(--text-secondary);
}

/* Select dropdown specific styles */
select.control-input {
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3e%3cpath fill='%23525252' d='M6 8L0 0h12z'/%3e%3c/svg%3e");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 36px;
}

.status-info {
  padding: 12px;
  background: var(--accent-light);
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 13px;
  color: var(--text);
}

.status-info strong {
  font-weight: 600;
  color: var(--text);
}
</style>
