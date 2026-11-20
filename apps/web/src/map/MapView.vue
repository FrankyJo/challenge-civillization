<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import type Phaser from "phaser";

const container = ref<HTMLDivElement | null>(null);
const game = shallowRef<Phaser.Game | null>(null);
const ready = ref(false);

onMounted(async () => {
  if (!container.value) return;
  // Phaser is loaded lazily so the shell renders before the renderer bundle.
  const { createMapGame } = await import("./scene.js");
  if (!container.value) return;
  game.value = createMapGame(container.value, () => {
    ready.value = true;
  });
});

onBeforeUnmount(() => {
  game.value?.destroy(true);
  game.value = null;
});
</script>

<template>
  <section class="map" aria-labelledby="map-heading">
    <h2 id="map-heading">World map</h2>
    <p class="note">
      Renderer bootstrap only. No world is loaded: the live and historical map projections arrive in Phase 20.
    </p>
    <div
      ref="container"
      class="canvas"
      data-testid="map-canvas"
      :data-renderer-ready="ready ? 'true' : 'false'"
      role="img"
      aria-label="Empty map canvas; no world loaded"
    ></div>
  </section>
</template>

<style scoped>
.map h2 {
  font-size: 1.1rem;
  margin: 0 0 0.25rem;
}
.note {
  color: var(--muted);
  margin: 0 0 0.75rem;
}
.canvas {
  width: 100%;
  max-width: 960px;
  aspect-ratio: 16 / 9;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}
</style>
