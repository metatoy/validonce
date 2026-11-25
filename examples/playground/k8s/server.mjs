// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// The playground's simulated Kubernetes API server. There is no cluster: this handler reads the Contact
// CRD, translates its CEL with validonce, runs every rule on the server side (`server_only` rules
// included) with validonce's evaluator, and answers a failure in the shape of a Kubernetes `Status`
// (reason Invalid, code 422, details.causes). It also adds a top-level `validonce` list (the same issues,
// with rule ids) so the playground's panels can number them. Real Kubernetes does not send that list.
// Stateless: it stores nothing and never logs a body.

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { evaluate } from "validonce";
import { translateCrd } from "validonce/kubernetes";

const PORT = Number(process.env.PORT ?? 8060);
const LIMIT = 16 * 1024;
const ORIGINS = (process.env.ALLOW_ORIGINS ?? "https://playground.metatoy.com,http://localhost:5180")
  .split(",")
  .map((o) => o.trim());

const crd = JSON.parse(readFileSync(new URL("./contact-crd.json", import.meta.url), "utf8"));
const version = Object.values(translateCrd(crd).versions)[0];
const rules = version.schema["x-validonce"].rules;
const catalog = version.catalog;
const props = version.schema.properties;
const required = version.schema.required ?? [];

/** The schema checks the API server runs before CEL: required, type, enum, minLength, pattern. */
function schemaCauses(body) {
  const causes = [];
  for (const name of required) {
    if (body[name] === undefined || body[name] === null) {
      causes.push({ reason: "FieldValueRequired", message: "Required value", field: name });
    }
  }
  for (const [name, def] of Object.entries(props)) {
    const v = body[name];
    if (v === undefined || v === null) continue;
    let message;
    if (typeof v !== "string") {
      message = `Invalid value: "${typeof v}": ${name} must be of type string`;
    } else if (def.enum && !def.enum.includes(v)) {
      message = `Unsupported value: "${v}": supported values: ${def.enum.map((e) => `"${e}"`).join(", ")}`;
    } else if (def.minLength && v.length < def.minLength) {
      message = `Invalid value: "": ${name} in body should be at least ${def.minLength} chars long`;
    } else if (def.pattern && !new RegExp(def.pattern).test(v)) {
      message = `Invalid value: "${v}": ${name} in body should match '${def.pattern}'`;
    }
    if (message) causes.push({ reason: "FieldValueInvalid", message, field: name });
  }
  return causes;
}

function failureStatus(body) {
  const fields = schemaCauses(body);
  const issues = fields.length === 0 ? evaluate(rules, body, { side: "server" }) : [];
  const causes = [
    ...fields,
    ...issues.map((i) => ({
      reason: "FieldValueInvalid",
      message: `Invalid value: "object": ${catalog[i.key] ?? i.key}`,
      field: i.path.join("."),
    })),
  ];
  if (causes.length === 0) return undefined;
  const summary = causes.map((c) => `${c.field}: ${c.message}`).join(", ");
  return {
    kind: "Status",
    apiVersion: "v1",
    metadata: {},
    status: "Failure",
    message: `Contact.example.test "contact" is invalid: [${summary}]`,
    reason: "Invalid",
    details: { name: "contact", group: "example.test", kind: "Contact", causes },
    code: 422,
    validonce: issues,
  };
}

const server = createServer((req, res) => {
  const origin = req.headers.origin;
  if (origin && ORIGINS.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Vary", "Origin");
  const url = new URL(req.url ?? "/", "http://k8s");
  const send = (code, payload) =>
    res.writeHead(code, { "content-type": "application/json" }).end(JSON.stringify(payload));
  if (req.method === "OPTIONS") return void res.writeHead(204).end();
  if (url.pathname === "/health") return void res.writeHead(200).end("ok");
  if (url.pathname !== "/contacts" || req.method !== "POST") return void res.writeHead(404).end();
  const chunks = [];
  let size = 0;
  req.on("data", (c) => {
    size += c.length;
    if (size <= LIMIT) chunks.push(c);
  });
  req.on("end", () => {
    if (size > LIMIT) return send(413, { kind: "Status", status: "Failure", reason: "RequestEntityTooLarge", code: 413 });
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch (_e) {
      body = null;
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return send(400, { kind: "Status", status: "Failure", reason: "BadRequest", code: 400 });
    }
    const failure = failureStatus(body);
    send(failure ? 422 : 200, failure ?? { ok: true });
  });
});

server.listen(PORT, () => console.log(`simulated Kubernetes API server on :${PORT}`));
