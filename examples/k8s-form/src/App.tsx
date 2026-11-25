// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { registerDeps } from "validonce/react-hook-form";
import { fieldErrorsFromIssues } from "validonce/server-errors";
import { withRules } from "validonce/zod";
import { z } from "zod";
import { dryRunIssues, k8sServerCatalog } from "./dryrun";
import { simulateDryRun } from "./fixtures";
import { translateSignupCrd } from "./translate";

const { rules, catalog } = translateSignupCrd();
const messages = { ...catalog, ...k8sServerCatalog };

const baseSchema = z.object({
  plan: z.enum(["free", "pro"]),
  company: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  start: z.string().nullable(),
  end: z.string().nullable(),
  minReplicas: z.number().nullable(),
  maxReplicas: z.number().nullable(),
});

type FormValues = z.input<typeof baseSchema>;
type Field = keyof FormValues;

const text = (v: unknown) => (v === "" ? null : v);
const int = (v: unknown) => (v === "" || v == null ? null : Number(v));

export function App() {
  const [saved, setSaved] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const schema = useMemo(() => withRules(baseSchema, rules, { messages }), []);
  const deps = useMemo(() => registerDeps<Field>(rules), []);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: {
      plan: "free",
      company: null,
      email: null,
      phone: null,
      start: null,
      end: null,
      minReplicas: null,
      maxReplicas: null,
    },
  });

  // The browser rules passed. Ask the API server (here: a recorded answer) about the rest.
  function onValid(values: FormValues) {
    setSaved(false);
    setServerErrors({});
    const res = simulateDryRun(values);
    if (res.status < 300) {
      setSaved(true);
      return;
    }
    setServerErrors(fieldErrorsFromIssues(dryRunIssues(res.body), messages));
  }

  function error(name: Field) {
    return errors[name]?.message ?? serverErrors[name];
  }
  function fieldError(name: Field) {
    const msg = error(name);
    return (
      <p id={`error-${name}`} className="error" data-testid={`error-${name}`} hidden={!msg}>
        {msg}
      </p>
    );
  }
  const a11y = (name: Field) => ({
    "aria-invalid": error(name) ? true : undefined,
    "aria-describedby": `error-${name}`,
  });
  const textField = (name: "company" | "email" | "phone", label: string) => (
    <>
      <label>
        {label}
        <input
          data-testid={name}
          {...a11y(name)}
          {...register(name, { ...deps(name), setValueAs: text })}
        />
      </label>
      {fieldError(name)}
    </>
  );
  const dateField = (name: "start" | "end", label: string) => (
    <>
      <label>
        {label}
        <input
          type="date"
          data-testid={name}
          {...a11y(name)}
          {...register(name, { ...deps(name), setValueAs: text })}
        />
      </label>
      {fieldError(name)}
    </>
  );
  const numField = (name: "minReplicas" | "maxReplicas", label: string) => (
    <>
      <label>
        {label}
        <input
          type="number"
          data-testid={name}
          {...a11y(name)}
          {...register(name, { ...deps(name), setValueAs: int })}
        />
      </label>
      {fieldError(name)}
    </>
  );

  return (
    <main>
      <h1>Signup resource</h1>
      <p data-testid="source">Rules from the Signup CRD (example.test/v1)</p>
      <form noValidate onSubmit={handleSubmit(onValid)}>
        <label>
          Plan
          <select {...register("plan", { ...deps("plan") })} {...a11y("plan")} data-testid="plan">
            <option value="free">free</option>
            <option value="pro">pro</option>
          </select>
        </label>
        {fieldError("plan")}
        {textField("company", "Company")}
        {textField("email", "Email")}
        {textField("phone", "Phone")}
        {dateField("start", "Start date")}
        {dateField("end", "End date")}
        {numField("minReplicas", "Min replicas")}
        {numField("maxReplicas", "Max replicas")}
        <button type="submit" data-testid="submit">
          Create
        </button>
        {saved && <p data-testid="result">Accepted by the API server (dry run)</p>}
      </form>
      <style>{`
        body { background: #e8e2d2; color: #231f20; font-family: system-ui, sans-serif; margin: 0; }
        main { max-width: 420px; margin: 2rem auto; padding: 0 1rem; }
        form { display: grid; gap: .75rem; }
        label { display: grid; gap: .25rem; font-weight: 600; }
        input, select { padding: .4rem; font: inherit; }
        button { background: #4f7a17; color: #fff; border: 0; padding: .6rem; font: inherit; cursor: pointer; }
        .error { color: #9b2c1d; margin: 0; }
        [hidden] { display: none; }
      `}</style>
    </main>
  );
}
