<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2026 Metatoy LLC -->
<script setup>
import { toTypedSchema } from "@vee-validate/yup";
import { useForm } from "vee-validate";
import { watch } from "vue";
import { Contact } from "./contact.schema.mjs";

const form = useForm({
  validationSchema: toTypedSchema(Contact),
  initialValues: {
    email: null,
    phone: null,
    street: null,
    city: null,
    postalCode: null,
    country: "US",
    availableFrom: null,
    availableTo: null,
  },
});
const { errors, defineField, handleSubmit } = form;
const [email] = defineField("email");
const [phone] = defineField("phone");
const [street] = defineField("street");
const [city] = defineField("city");
const [postalCode] = defineField("postalCode");
const [country] = defineField("country");
const [availableFrom] = defineField("availableFrom");
const [availableTo] = defineField("availableTo");

watch(country, () => form.validateField("postalCode"));
watch(phone, () => form.validateField("email"));

const onSubmit = handleSubmit((values) =>
  fetch("/contacts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  }),
);
</script>

<template>
  <form @submit="onSubmit">
    <label>Email <input v-model="email" name="email" /><span>{{ errors.email }}</span></label>
    <label>Phone <input v-model="phone" name="phone" /><span>{{ errors.phone }}</span></label>
    <label>Street <input v-model="street" name="street" /><span>{{ errors.street }}</span></label>
    <label>City <input v-model="city" name="city" /><span>{{ errors.city }}</span></label>
    <label>Postal code <input v-model="postalCode" name="postalCode" /><span>{{ errors.postalCode }}</span></label>
    <label>Available from <input v-model="availableFrom" name="availableFrom" type="date" /><span>{{ errors.availableFrom }}</span></label>
    <label>Available to <input v-model="availableTo" name="availableTo" type="date" /><span>{{ errors.availableTo }}</span></label>
    <label>
      Country
      <select v-model="country" name="country">
        <option>US</option>
        <option>CA</option>
        <option>GB</option>
        <option>other</option>
      </select>
      <span>{{ errors.country }}</span>
    </label>
    <button>Send</button>
  </form>
</template>
