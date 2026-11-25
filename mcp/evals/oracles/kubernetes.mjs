// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// Hand-written reading of the four translatable CEL rules of testbeds/stacks/kubernetes/crd/booking-crd.json, over `spec`.
// It stands in for the API server: `has()` is "the key is there" (Kubernetes drops null for non-nullable fields).
const has = (s, f) => s[f] !== undefined && s[f] !== null;

export default function check(s) {
  const paths = [];
  if (s.tier === "premium" && !has(s, "contact")) paths.push("contact");
  if (has(s, "from") && has(s, "to") && s.to < s.from) paths.push("to");
  if (has(s, "minGuests") && has(s, "maxGuests") && s.minGuests > s.maxGuests) paths.push("maxGuests");
  if (!has(s, "email") && !has(s, "phone")) paths.push("email");
  return paths;
}
