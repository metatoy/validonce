// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { rulesFromOpenApi } from "validonce/openapi";
import {
  fieldErrorsFromIssues,
  issuesFromResponse,
} from "validonce/server-errors";
import type { RuleSet } from "validonce";
import { withRules } from "validonce/zod";
import { z } from "zod";

const messages: Record<string, string> = {
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
const fields = ["plan", "company", "email", "start", "end", "quantity"] as const;
type Field = (typeof fields)[number];

const params = new URLSearchParams(window.location.search);
const api = (params.get("api") ?? "http://localhost:5080").replace(/\/$/, "");
const port = new URL(api).port;
const backend = port === "8010" ? "FastAPI" : "ASP.NET";
const openapiPath =
  params.get("openapi") ?? (port === "8010" ? "/openapi.json" : "/openapi/v1.json");

function Form({ rules }: { rules: RuleSet }) {
  const [skipClient, setSkipClient] = useState(false);
  const [saved, setSaved] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const schema = useMemo(
    () => withRules(baseSchema, rules, { messages }),
    [rules],
  );
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      plan: "free",
      company: null,
      email: "",
      start: "",
      end: null,
      quantity: 1,
    },
  });

  async function post(values: unknown) {
    setSaved(false);
    setServerErrors({});
    const res = await fetch(`${api}/signups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (res.ok) {
      setSaved(true);
      return;
    }
    const body: unknown = await res.json().catch(() => null);
    setServerErrors(fieldErrorsFromIssues(issuesFromResponse(body), messages));
  }

  const onValid = (values: FormValues) => post(values);
  const onSkip = () => post(getValues());

  function error(name: Field) {
    return errors[name]?.message ?? serverErrors[name];
  }

  // The error for a field sits directly under that field, linked for screen readers.
  function fieldError(name: Field) {
    const text = error(name);
    return (
      <p id={`error-${name}`} className="error" data-testid={`error-${name}`} hidden={!text}>
        {text}
      </p>
    );
  }
  const a11y = (name: Field) => ({
    "aria-invalid": error(name) ? true : undefined,
    "aria-describedby": `error-${name}`,
  });

  return (
    <form
      noValidate
      onSubmit={skipClient ? (e) => (e.preventDefault(), void onSkip()) : handleSubmit(onValid)}
    >
      <label>
        Plan
        <select {...register("plan")} {...a11y("plan")} data-testid="plan">
          <option value="free">free</option>
          <option value="pro">pro</option>
        </select>
      </label>
      {fieldError("plan")}
      <label>
        Company
        <input
          data-testid="company"
          {...a11y("company")}
          {...register("company", { setValueAs: (v) => (v === "" ? null : v) })}
        />
      </label>
      {fieldError("company")}
      <label>
        Email
        <input data-testid="email" {...a11y("email")} {...register("email")} />
      </label>
      {fieldError("email")}
      <label>
        Start date
        <input type="date" data-testid="start" {...a11y("start")} {...register("start")} />
      </label>
      {fieldError("start")}
      <label>
        End date
        <input
          type="date"
          data-testid="end"
          {...a11y("end")}
          {...register("end", { setValueAs: (v) => (v === "" ? null : v) })}
        />
      </label>
      {fieldError("end")}
      <label>
        Quantity
        <input
          type="number"
          data-testid="quantity"
          {...a11y("quantity")}
          {...register("quantity", {
            setValueAs: (v) => (v === "" || v == null ? Number.NaN : Number(v)),
          })}
        />
      </label>
      {fieldError("quantity")}
      <label className="check">
        <input
          type="checkbox"
          data-testid="skip-client"
          checked={skipClient}
          onChange={(e) => setSkipClient(e.target.checked)}
        />
        Skip browser checks
      </label>
      <button type="submit" data-testid="submit">
        Sign up
      </button>
      {saved && <p data-testid="result">Saved</p>}
    </form>
  );
}

export function App() {
  const [rules, setRules] = useState<RuleSet | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${api}${openapiPath}`)
      .then((r) => r.json())
      .then((doc: unknown) => {
        const rs = rulesFromOpenApi(doc, "Signup");
        if (!rs) throw new Error("no x-validonce rules for Signup");
        setRules(rs);
      })
      .catch((e: unknown) => setLoadError(String(e)));
  }, []);

  return (
    <main>
      <h1>Sign up</h1>
      <p data-testid="backend">
        Backend: {backend} ({api})
      </p>
      {loadError && <p className="error">{loadError}</p>}
      {rules ? <Form rules={rules} /> : !loadError && <p>Loading rules…</p>}
      <style>{`
        body { background: #e8e2d2; color: #231f20; font-family: system-ui, sans-serif; margin: 0; }
        main { max-width: 420px; margin: 2rem auto; padding: 0 1rem; }
        form { display: grid; gap: .75rem; }
        label { display: grid; gap: .25rem; font-weight: 600; }
        label.check { display: flex; gap: .5rem; align-items: center; font-weight: 400; }
        input, select { padding: .4rem; font: inherit; }
        button { background: #4f7a17; color: #fff; border: 0; padding: .6rem; font: inherit; cursor: pointer; }
        .error { color: #9b2c1d; margin: 0; }
        [hidden] { display: none; }
      `}</style>
    </main>
  );
}
