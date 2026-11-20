<script setup lang="ts">
import { onMounted, ref } from "vue";
import { parseWebEnv } from "./env.js";
import { fetchApiHealth, type ApiStatusView } from "./health.js";
import MapView from "./map/MapView.vue";

const env = parseWebEnv(import.meta.env);
const status = ref<ApiStatusView | null>(null);

onMounted(async () => {
  status.value = await fetchApiHealth(env.VITE_API_BASE_PATH);
});
</script>

<template>
  <header>
    <h1>Civilization: Living History</h1>
    <p
      class="status"
      data-testid="api-status"
      :data-state="status?.state ?? 'checking'"
      role="status"
      aria-live="polite"
    >
      {{ status?.label ?? "Checking API…" }}
    </p>
  </header>
  <main>
    <MapView />
  </main>
</template>

<style>
:root {
  color-scheme: light dark;
  --bg: #f7f5f0;
  --fg: #1d232a;
  --muted: #59636e;
  --border: #c9ced4;
  font-family:
    system-ui,
    -apple-system,
    "Segoe UI",
    sans-serif;
  line-height: 1.5;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #11161b;
    --fg: #e7ebef;
    --muted: #9aa5b1;
    --border: #2c3742;
  }
}
body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
}
header,
main {
  max-width: 1000px;
  margin: 0 auto;
  padding: 1rem;
}
h1 {
  font-size: 1.5rem;
  margin: 0;
}
.status {
  margin: 0.25rem 0 0;
  color: var(--muted);
}
</style>
