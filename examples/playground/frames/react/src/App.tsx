// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { type Resolver, useForm } from "react-hook-form";
import type { Issue, RuleSet } from "validonce";
import { rulesFromOpenApi } from "validonce/openapi";
import { registerDeps } from "validonce/react-hook-form";
import { withRules } from "validonce/zod";
import {
  announceReady,
  applyTheme,
  baseSchema,
  COUNTRIES,
  clientIssues,
  defaultValues,
  type Entry,
  entriesByField,
  FIELDS,
  type Field,
  type FormValues,
  fetchOpenApi,
  LABELS,
  messages,
  onSet,
  readParams,
  reportIssues,
  submitContact,
  toBody,
  touch,
} from "validonce-playground-frame-shared";

const params = readParams();
applyTheme(params.theme);

function Errors({ name, entries }: { name: Field; entries: Entry[] }) {
  const [open, setOpen] = useState(false);
  const [first, ...rest] = entries;
  return (
    <div className="errors" id={`error-wrap-${name}`} hidden={!first}>
      <div className="line">
        <span data-testid={`error-${name}`}>{first?.text}</span>
        {first?.server && (
          <span className="badge" data-testid={`badge-server-${name}`}>
            from the server
          </span>
        )}
        {rest.length > 0 && (
          <button
            type="button"
            className="more"
            data-testid={`more-${name}`}
            onClick={() => setOpen(!open)}
          >
            {open ? "less" : `+${rest.length} more`}
          </button>
        )}
      </div>
      {open && (
        <ul data-testid={`error-more-${name}`}>
          {rest.map((e) => (
            <li key={e.text}>
              {e.text}
              {e.server && <span className="badge">from the server</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Form({ rules }: { rules: RuleSet }) {
  const [skipClient, setSkipClient] = useState(false);
  const [saved, setSaved] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [server, setServer] = useState<Issue[]>([]);
  const schema = useMemo(() => withRules(baseSchema, rules, { messages }), [rules]);
  // Changing one field re-checks the fields whose rules read it.
  const deps = useMemo(() => registerDeps<Field>(rules), [rules]);
  const resolver = useMemo<Resolver<FormValues>>(() => {
    const inner = zodResolver(schema);
    // The inputs hold text; the schema wants null for an empty optional field.
    return ((values, ctx, opts) =>
      inner(toBody(values) as never, ctx, opts as never)) as Resolver<FormValues>;
  }, [schema]);
  const {
    register,
    handleSubmit,
    getValues,
    watch,
    formState: { errors },
  } = useForm<FormValues>({ resolver, mode: "onChange", defaultValues });
  const values = watch();

  useEffect(() => {
    reportIssues("client", clientIssues(rules, values));
  }, [rules, values]);

  useEffect(() => {
    onSet(setSkipClient);
  }, []);

  async function post(v: FormValues) {
    setSaved(false);
    setSubmitted(true);
    const res = await submitContact(params.api, v);
    setServer(res.issues);
    setSaved(res.ok);
  }

  const entries = entriesByField({
    rules,
    values,
    primary: Object.fromEntries(FIELDS.map((f) => [f, errors[f]?.message])) as Partial<
      Record<Field, string>
    >,
    touched,
    submitted,
    server,
  });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (skipClient) {
      e.preventDefault();
      void post(getValues());
      return;
    }
    setSubmitted(true);
    void handleSubmit(post)(e);
  }

  const reg = (name: Field) =>
    register(name, {
      ...deps(name),
      onChange: () => {
        setTouched((t) => touch(t, name, rules));
        setServer([]);
        setSaved(false);
      },
    });
  const a11y = (name: Field) => ({
    "aria-invalid": entries[name].length > 0 ? true : undefined,
    "aria-describedby": `error-wrap-${name}`,
    "data-testid": `field-${name}`,
  });

  const field = (name: Field, type = "text") => (
    <div className="field">
      <label>
        {LABELS[name]}
        <input type={type} {...a11y(name)} {...reg(name)} />
      </label>
      <Errors name={name} entries={entries[name]} />
    </div>
  );

  return (
    <form noValidate onSubmit={onSubmit}>
      {field("email")}
      {field("phone")}
      {field("street")}
      <div className="row">
        {field("city")}
        {field("postalCode")}
      </div>
      <div className="field">
        <label>
          {LABELS.country}
          <select {...a11y("country")} {...reg("country")}>
            {COUNTRIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <Errors name="country" entries={entries.country} />
      </div>
      <div className="row">
        {field("availableFrom", "date")}
        {field("availableTo", "date")}
      </div>
      <label className="toggle">
        <input
          type="checkbox"
          data-testid="toggle-skip"
          checked={skipClient}
          onChange={(e) => setSkipClient(e.target.checked)}
        />
        Skip browser checks
      </label>
      <button type="submit" className="submit" data-testid="submit">
        Submit
      </button>
      <p className="status" data-testid="result" hidden={!saved}>
        Saved
      </p>
    </form>
  );
}

export function App() {
  const [rules, setRules] = useState<RuleSet | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetchOpenApi(params)
      .then((doc) => {
        const rs = rulesFromOpenApi(doc, params.schema);
        if (!rs) throw new Error(`no x-validonce rules for ${params.schema}`);
        setRules(rs);
        announceReady("react");
      })
      .catch((e: unknown) => setLoadError(String(e)));
  }, []);

  return (
    <main>
      {loadError && (
        <p className="load-error" data-testid="load-error">
          {loadError}
        </p>
      )}
      {rules ? <Form rules={rules} /> : !loadError && <p>Loading rules…</p>}
    </main>
  );
}
