<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2026 Metatoy LLC -->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useForm } from "vee-validate";
import type { Issue, RuleSet } from "validonce";
import { toVeeSchema, watchDependents } from "validonce/vue";
import { withRules } from "validonce/zod";
import { z } from "zod";
import {
  baseSchema,
  clientIssues,
  COUNTRIES,
  defaultValues,
  entriesByField,
  FIELDS,
  type Field,
  type FormValues,
  LABELS,
  messages,
  onSet,
  reportIssues,
  submitContact,
  toBody,
  touch,
} from "validonce-playground-frame-shared";
import FieldErrors from "./FieldErrors.vue";

const props = defineProps<{ rules: RuleSet; api: string }>();

// The inputs hold text; the schema wants null for an empty optional field.
const schema = z.preprocess(
  (v) => toBody(v as FormValues),
  withRules(baseSchema, props.rules, { messages }),
);

const form = useForm<FormValues>({
  validationSchema: toVeeSchema(schema),
  initialValues: { ...defaultValues },
});
const { values, errors, setFieldValue, handleSubmit } = form;
// Changing one field re-checks the fields whose rules read it.
watchDependents(form, props.rules);

const skipClient = ref(false);
const saved = ref(false);
const submitted = ref(false);
const touched = ref<Set<string>>(new Set());
const server = ref<Issue[]>([]);

onMounted(() => onSet((v) => (skipClient.value = v)));

watch(
  () => ({ ...values }) as FormValues,
  (v) => reportIssues("client", clientIssues(props.rules, v)),
  { immediate: true },
);

const entries = computed(() =>
  entriesByField({
    rules: props.rules,
    values: values as FormValues,
    primary: Object.fromEntries(FIELDS.map((f) => [f, errors.value[f]])) as Partial<Record<Field, string>>,
    touched: touched.value,
    submitted: submitted.value,
    server: server.value,
  }),
);

async function post(v: FormValues) {
  saved.value = false;
  submitted.value = true;
  const res = await submitContact(props.api, v);
  server.value = res.issues;
  saved.value = res.ok;
}

const onValid = handleSubmit((v) => post(v as FormValues));
function onSubmit(e: Event) {
  submitted.value = true;
  if (skipClient.value) void post({ ...values } as FormValues);
  else void onValid(e);
}

function edit(name: Field, e: Event) {
  setFieldValue(name, (e.target as HTMLInputElement).value);
  touched.value = touch(touched.value, name, props.rules);
  server.value = [];
  saved.value = false;
}
const a11y = (name: Field) => ({
  "aria-invalid": entries.value[name].length > 0 ? true : undefined,
  "aria-describedby": `error-wrap-${name}`,
  "data-testid": `field-${name}`,
});
const type = (name: Field) => (name === "availableFrom" || name === "availableTo" ? "date" : "text");
</script>

<template>
  <form novalidate @submit.prevent="onSubmit">
    <template v-for="name in (['email', 'phone', 'street'] as const)" :key="name">
      <div class="field">
        <label>
          {{ LABELS[name] }}
          <input :type="type(name)" v-bind="a11y(name)" :value="values[name]" @input="edit(name, $event)" />
        </label>
        <FieldErrors :name="name" :entries="entries[name]" />
      </div>
    </template>
    <div class="row">
      <div v-for="name in (['city', 'postalCode'] as const)" :key="name" class="field">
        <label>
          {{ LABELS[name] }}
          <input :type="type(name)" v-bind="a11y(name)" :value="values[name]" @input="edit(name, $event)" />
        </label>
        <FieldErrors :name="name" :entries="entries[name]" />
      </div>
    </div>
    <div class="field">
      <label>
        {{ LABELS.country }}
        <select v-bind="a11y('country')" :value="values.country" @change="edit('country', $event)">
          <option v-for="c in COUNTRIES" :key="c.value" :value="c.value">{{ c.label }}</option>
        </select>
      </label>
      <FieldErrors name="country" :entries="entries.country" />
    </div>
    <div class="row">
      <div v-for="name in (['availableFrom', 'availableTo'] as const)" :key="name" class="field">
        <label>
          {{ LABELS[name] }}
          <input :type="type(name)" v-bind="a11y(name)" :value="values[name]" @input="edit(name, $event)" />
        </label>
        <FieldErrors :name="name" :entries="entries[name]" />
      </div>
    </div>
    <label class="toggle">
      <input type="checkbox" data-testid="toggle-skip" v-model="skipClient" />
      Skip browser checks
    </label>
    <button type="submit" class="submit" data-testid="submit">Submit</button>
    <p class="status" data-testid="result" :hidden="!saved">Saved</p>
  </form>
</template>
