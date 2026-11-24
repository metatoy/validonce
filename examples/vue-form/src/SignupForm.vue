<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2026 Metatoy LLC -->
<script setup lang="ts">
import { ref } from "vue";
import { useForm } from "vee-validate";
import type { RuleSet } from "validonce";
import type { Catalog } from "validonce/messages";
import { fieldErrorsFromIssues, issuesFromResponse } from "validonce/server-errors";
import { toVeeSchema, watchDependents } from "validonce/vue";
import { withRules } from "validonce/zod";
import { z } from "zod";
import { api } from "./api";

const props = defineProps<{ rules: RuleSet }>();

const messages: Catalog = {
  "rules.company_required": "Company is required on the Pro plan",
  "rules.end_after_start": "End date must be on or after the start date",
  "rules.quantity_min": "Quantity must be at least {min}",
};

const baseSchema = z.object({
  plan: z.enum(["free", "pro"]),
  company: z.string().nullable(),
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  start: z.string().min(1, "Start date is required"),
  end: z.string().nullable(),
  quantity: z.number("Quantity is required"),
});
type FormValues = z.input<typeof baseSchema>;
type Field = keyof FormValues;

const schema = withRules(baseSchema, props.rules, { messages });

const form = useForm<FormValues>({
  validationSchema: toVeeSchema(schema),
  initialValues: {
    plan: "free",
    company: null,
    email: "",
    start: "",
    end: null,
    quantity: 1,
  },
});
const { values, errors, setFieldValue, handleSubmit } = form;
// Changing one field re-checks the fields whose rules read it.
watchDependents(form, props.rules);

const skipClient = ref(false);
const saved = ref(false);
const serverErrors = ref<Record<string, string>>({});

async function post(body: unknown) {
  saved.value = false;
  serverErrors.value = {};
  const res = await fetch(`${api}/signups`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.ok) {
    saved.value = true;
    return;
  }
  const json: unknown = await res.json().catch(() => null);
  serverErrors.value = fieldErrorsFromIssues(issuesFromResponse(json), messages, props.rules);
}

const onValid = handleSubmit((v) => post(v));
// "Skip browser checks" sends whatever is in the form, so the server's 422 can be seen.
function onSubmit(e: Event) {
  if (skipClient.value) void post(values);
  else void onValid(e);
}

function error(name: Field): string | undefined {
  return errors.value[name] ?? serverErrors.value[name];
}
const a11y = (name: Field) => ({
  "aria-invalid": error(name) ? true : undefined,
  "aria-describedby": `error-${name}`,
});

// Blank inputs become null (or NaN for the number) so the Zod type check passes through to the rules.
const text = (e: Event) => (e.target as HTMLInputElement).value;
const nullable = (e: Event) => text(e) || null;
const num = (e: Event) => (text(e) === "" ? Number.NaN : Number(text(e)));
</script>

<template>
  <form novalidate @submit.prevent="onSubmit">
    <label>
      Plan
      <select
        data-testid="plan"
        v-bind="a11y('plan')"
        :value="values.plan"
        @change="setFieldValue('plan', text($event) as FormValues['plan'])"
      >
        <option value="free">free</option>
        <option value="pro">pro</option>
      </select>
    </label>
    <p id="error-plan" class="error" data-testid="error-plan" :hidden="!error('plan')">{{ error("plan") }}</p>
    <label>
      Company
      <input
        data-testid="company"
        v-bind="a11y('company')"
        :value="values.company ?? ''"
        @input="setFieldValue('company', nullable($event))"
      />
    </label>
    <p id="error-company" class="error" data-testid="error-company" :hidden="!error('company')">{{ error("company") }}</p>
    <label>
      Email
      <input
        data-testid="email"
        v-bind="a11y('email')"
        :value="values.email"
        @input="setFieldValue('email', text($event))"
      />
    </label>
    <p id="error-email" class="error" data-testid="error-email" :hidden="!error('email')">{{ error("email") }}</p>
    <label>
      Start date
      <input
        type="date"
        data-testid="start"
        v-bind="a11y('start')"
        :value="values.start"
        @input="setFieldValue('start', text($event))"
      />
    </label>
    <p id="error-start" class="error" data-testid="error-start" :hidden="!error('start')">{{ error("start") }}</p>
    <label>
      End date
      <input
        type="date"
        data-testid="end"
        v-bind="a11y('end')"
        :value="values.end ?? ''"
        @input="setFieldValue('end', nullable($event))"
      />
    </label>
    <p id="error-end" class="error" data-testid="error-end" :hidden="!error('end')">{{ error("end") }}</p>
    <label>
      Quantity
      <input
        type="number"
        data-testid="quantity"
        v-bind="a11y('quantity')"
        :value="Number.isNaN(values.quantity) ? '' : values.quantity"
        @input="setFieldValue('quantity', num($event))"
      />
    </label>
    <p id="error-quantity" class="error" data-testid="error-quantity" :hidden="!error('quantity')">{{ error("quantity") }}</p>
    <label class="check">
      <input type="checkbox" data-testid="skip-client" v-model="skipClient" />
      Skip browser checks
    </label>
    <button type="submit" data-testid="submit">Sign up</button>
    <p v-if="saved" data-testid="result">Saved</p>
  </form>
</template>
