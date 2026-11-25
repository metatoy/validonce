<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2026 Metatoy LLC -->
<script setup lang="ts">
import { computed, ref } from "vue";
import type { Entry } from "validonce-playground-frame-shared";

const props = defineProps<{ name: string; entries: Entry[] }>();
const open = ref(false);
const first = computed(() => props.entries[0]);
const rest = computed(() => props.entries.slice(1));
</script>

<template>
  <div class="errors" :id="`error-wrap-${name}`" :hidden="!first">
    <div class="line">
      <span :data-testid="`error-${name}`">{{ first?.text }}</span>
      <span v-if="first?.server" class="badge" :data-testid="`badge-server-${name}`">from the server</span>
      <button
        v-if="rest.length > 0"
        type="button"
        class="more"
        :data-testid="`more-${name}`"
        @click="open = !open"
      >
        {{ open ? "less" : `+${rest.length} more` }}
      </button>
    </div>
    <ul v-if="open" :data-testid="`error-more-${name}`">
      <li v-for="e in rest" :key="e.text">
        {{ e.text }}<span v-if="e.server" class="badge">from the server</span>
      </li>
    </ul>
  </div>
</template>
