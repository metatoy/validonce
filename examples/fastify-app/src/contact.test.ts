// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { describe, expect, it } from "vitest";
import { buildApp } from "./app";

const valid = { email: "a@example.test", country: "CA" };

async function post(body: unknown, headers: Record<string, string> = {}) {
  const app = await buildApp();
  const res = await app.inject({
    method: "POST",
    url: "/contacts",
    payload: body as object,
    headers,
  });
  await app.close();
  return res;
}

function issues(res: { json(): { validonce?: { ruleId: string; key: string; path: string[] }[] } }) {
  return (res.json().validonce ?? []).map((i) => [i.ruleId, i.key, i.path.join(".")]);
}

describe("POST /contacts", () => {
  it("accepts a valid contact", async () => {
    const res = await post(valid);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it("at_least_one_of: no email and no phone", async () => {
    const res = await post({ country: "CA" });
    expect(res.statusCode).toBe(422);
    expect(issues(res)).toEqual([
      ["Contact.at_least_one_of.email", "rules.contact_email_or_phone", "email"],
    ]);
  });

  it("all_or_none: street without city and postal code", async () => {
    const res = await post({ ...valid, street: "1 Main St" });
    expect(res.statusCode).toBe(422);
    expect(issues(res)).toEqual([
      ["Contact.all_or_none.street", "rules.address_all_or_none", "street"],
    ]);
  });

  it("required_when: US needs a postal code", async () => {
    const res = await post({ ...valid, country: "US" });
    expect(res.statusCode).toBe(422);
    expect(issues(res)).toEqual([
      ["Contact.required_when.postalCode", "rules.postal_code_required_us", "postalCode"],
    ]);
  });

  it("compare: availableTo before availableFrom", async () => {
    const res = await post({ ...valid, availableFrom: "2026-03-02", availableTo: "2026-03-01" });
    expect(res.statusCode).toBe(422);
    expect(issues(res)).toEqual([
      ["Contact.compare.availableTo", "rules.available_to_after_from", "availableTo"],
    ]);
  });

  it("a field error is the framework's 400", async () => {
    const res = await post({ ...valid, country: "ZZ" });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a body over 16 KB", async () => {
    const res = await post({ ...valid, street: "x".repeat(17 * 1024) });
    expect(res.statusCode).toBe(413);
  });

  it("allows the playground origins", async () => {
    for (const origin of ["https://playground.metatoy.com", "http://localhost:5180"]) {
      const app = await buildApp();
      const res = await app.inject({
        method: "OPTIONS",
        url: "/contacts",
        headers: { origin, "access-control-request-method": "POST" },
      });
      await app.close();
      expect(res.headers["access-control-allow-origin"]).toBe(origin);
    }
  });

  it("rejects an oversized chunked body (no content-length)", async () => {
    const app = await buildApp();
    await app.listen({ port: 0, host: "127.0.0.1" });
    const { port } = app.server.address() as { port: number };
    const chunk = "x".repeat(1024);
    const body = new ReadableStream({
      start(c) {
        const enc = new TextEncoder();
        c.enqueue(enc.encode('{"country":"CA","email":"a@example.test","street":"'));
        for (let i = 0; i < 20; i++) c.enqueue(enc.encode(chunk));
        c.enqueue(enc.encode('"}'));
        c.close();
      },
    });
    const res = await fetch(`http://127.0.0.1:${port}/contacts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      duplex: "half",
    } as RequestInit);
    await app.close();
    expect(res.status).toBe(413);
  });
});
