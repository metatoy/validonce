<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2026 Metatoy LLC -->
<script setup lang="ts">
import { onMounted, ref } from "vue";
import type { RuleSet } from "validonce";
import { rulesFromOpenApi } from "validonce/openapi";
import { api, backend, openapiPath } from "./api";
import SignupForm from "./SignupForm.vue";

const rules = ref<RuleSet | null>(null);
const loadError = ref<string | null>(null);

onMounted(async () => {
  try {
    const doc: unknown = await (await fetch(`${api}${openapiPath}`)).json();
    const rs = rulesFromOpenApi(doc, "Signup");
    if (!rs) throw new Error("no x-validonce rules for Signup");
    rules.value = rs;
  } catch (e) {
    loadError.value = String(e);
  }
});
</script>

<template>
  <main>
    <h1>Sign up</h1>
    <p data-testid="backend">Backend: {{ backend }} ({{ api }})</p>
    <p v-if="loadError" class="error">{{ loadError }}</p>
    <SignupForm v-if="rules" :rules="rules" />
    <p v-else-if="!loadError">Loading rules…</p>
  </main>
</template>

<style>
body { background: #e8e2d2; color: #231f20; font-family: system-ui, sans-serif; margin: 0; }
main { max-width: 420px; margin: 2rem auto; padding: 0 1rem; }
form { display: grid; gap: .75rem; }
label { display: grid; gap: .25rem; font-weight: 600; }
label.check { display: flex; gap: .5rem; align-items: center; font-weight: 400; }
input, select { padding: .4rem; font: inherit; }
button { background: #4f7a17; color: #fff; border: 0; padding: .6rem; font: inherit; cursor: pointer; }
.error { color: #9b2c1d; margin: 0; }
[hidden] { display: none; }
</style>
