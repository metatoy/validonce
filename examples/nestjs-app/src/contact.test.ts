// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import "reflect-metadata";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app";

const valid = { email: "a@example.test", country: "CA" };
let base = "";
let close: () => Promise<void>;

beforeAll(async () => {
  const { app } = await buildApp();
  await app.listen(0, "127.0.0.1");
  base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  close = () => app.close();
});
afterAll(() => close());

async function post(body: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${base}/contacts`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown>, res };
}

function issues(body: Record<string, unknown>) {
  return ((body.validonce ?? []) as { ruleId: string; key: string; path: string[] }[]).map((i) => [
    i.ruleId,
    i.key,
    i.path.join("."),
  ]);
}

describe("POST /contacts", () => {
  it("accepts a valid contact", async () => {
    const r = await post(valid);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
  });

  it("at_least_one_of: no email and no phone", async () => {
    const r = await post({ country: "CA" });
    expect(r.status).toBe(422);
    expect(issues(r.body)).toEqual([
      ["Contact.at_least_one_of.email", "rules.contact_email_or_phone", "email"],
    ]);
  });

  it("all_or_none: street without city and postal code", async () => {
    const r = await post({ ...valid, street: "1 Main St" });
    expect(r.status).toBe(422);
    expect(issues(r.body)).toEqual([
      ["Contact.all_or_none.street", "rules.address_all_or_none", "street"],
    ]);
  });

  it("required_when: US needs a postal code", async () => {
    const r = await post({ ...valid, country: "US" });
    expect(r.status).toBe(422);
    expect(issues(r.body)).toEqual([
      ["Contact.required_when.postalCode", "rules.postal_code_required_us", "postalCode"],
    ]);
  });

  it("compare: availableTo before availableFrom", async () => {
    const r = await post({ ...valid, availableFrom: "2026-03-02", availableTo: "2026-03-01" });
    expect(r.status).toBe(422);
    expect(issues(r.body)).toEqual([
      ["Contact.compare.availableTo", "rules.available_to_after_from", "availableTo"],
    ]);
  });

  it("a field error is Nest's 400", async () => {
    const r = await post({ ...valid, country: "ZZ" });
    expect(r.status).toBe(400);
  });

  it("rejects a body over 16 KB", async () => {
    const r = await post({ ...valid, street: "x".repeat(17 * 1024) });
    expect(r.status).toBe(413);
  });

  it("allows the playground origins", async () => {
    for (const origin of ["https://playground.metatoy.com", "http://localhost:5180"]) {
      const res = await fetch(`${base}/contacts`, {
        method: "OPTIONS",
        headers: { origin, "access-control-request-method": "POST" },
      });
      expect(res.headers.get("access-control-allow-origin")).toBe(origin);
    }
  });

  it("rejects an oversized chunked body (no content-length)", async () => {
    const enc = new TextEncoder();
    const body = new ReadableStream({
      start(c) {
        c.enqueue(enc.encode('{"country":"CA","email":"a@example.test","street":"'));
        for (let i = 0; i < 20; i++) c.enqueue(enc.encode("x".repeat(1024)));
        c.enqueue(enc.encode('"}'));
        c.close();
      },
    });
    const res = await fetch(`${base}/contacts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      duplex: "half",
    } as RequestInit);
    expect(res.status).toBe(413);
  });
});
