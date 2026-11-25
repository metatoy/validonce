<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2026 Metatoy LLC -->
<script setup lang="ts">
import { onMounted, ref } from "vue";
import type { RuleSet } from "validonce";
import { rulesFromOpenApi } from "validonce/openapi";
import {
  announceReady,
  applyTheme,
  fetchOpenApi,
  readParams,
} from "validonce-playground-frame-shared";
import ContactForm from "./ContactForm.vue";

const params = readParams();
applyTheme(params.theme);

const rules = ref<RuleSet | null>(null);
const loadError = ref<string | null>(null);

onMounted(() => {
  fetchOpenApi(params)
    .then((doc) => {
      const rs = rulesFromOpenApi(doc, params.schema);
      if (!rs) throw new Error(`no x-validonce rules for ${params.schema}`);
      rules.value = rs;
      announceReady("vue");
    })
    .catch((e: unknown) => {
      loadError.value = String(e);
    });
});
</script>

<template>
  <main>
    <p v-if="loadError" class="load-error" data-testid="load-error">{{ loadError }}</p>
    <ContactForm v-if="rules" :rules="rules" :api="params.api" />
    <p v-else-if="!loadError">Loading rules…</p>
  </main>
</template>
