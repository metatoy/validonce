// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// A small form wired to the real validonce runtime. The rules are plain x-validonce data and
// are evaluated in the browser with evaluate(), the same function every client uses. Nothing
// is sent anywhere; the playground (playground.metatoy.com) shows the server side as well.

import CodeBlock from "@theme/CodeBlock";
import { type ReactNode, useMemo, useState } from "react";
import { evaluate, parseRuleSet } from "validonce";
import { type Catalog, formatMessage } from "validonce/messages";
import styles from "./styles.module.css";

export type LiveField = {
  name: string;
  label: string;
  type?: "text" | "date" | "number" | "email" | "tel";
  options?: string[];
  initial?: string;
};

export default function LiveRule(props: {
  title: string;
  fields: LiveField[];
  xValidonce: unknown;
  messages?: Catalog;
}): ReactNode {
  const ruleSet = useMemo(() => parseRuleSet(props.xValidonce), [props.xValidonce]);
  const [data, setData] = useState<Record<string, string>>(() =>
    Object.fromEntries(props.fields.map((f) => [f.name, f.initial ?? ""])),
  );
  const values = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v === "" ? null : v]));
  const issues = evaluate(ruleSet.rules, values, { side: "client" });
  const byField = new Map<string, string[]>();
  for (const i of issues) {
    const key = i.path.join(".");
    byField.set(key, [...(byField.get(key) ?? []), formatMessage(i, props.messages, ruleSet)]);
  }

  return (
    <div className={styles.live} data-testid="live-rule">
      <form className={styles.form} onSubmit={(e) => e.preventDefault()} noValidate>
        <p className={styles.title}>{props.title}</p>
        {props.fields.map((f) => {
          const id = `live-${props.title}-${f.name}`.replace(/\W+/g, "-");
          const errors = byField.get(f.name) ?? [];
          return (
            <div key={f.name} className={styles.field}>
              <label htmlFor={id}>{f.label}</label>
              {f.options ? (
                <select
                  id={id}
                  value={data[f.name]}
                  onChange={(e) => setData({ ...data, [f.name]: e.target.value })}
                >
                  {f.options.map((o) => (
                    <option key={o} value={o}>
                      {o || "(none)"}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={id}
                  type={f.type ?? "text"}
                  value={data[f.name]}
                  aria-invalid={errors.length > 0}
                  aria-describedby={errors.length ? `${id}-err` : undefined}
                  onChange={(e) => setData({ ...data, [f.name]: e.target.value })}
                />
              )}
              {errors.length > 0 && (
                <span id={`${id}-err`} className={styles.error} role="alert">
                  {errors.join(" ")}
                </span>
              )}
            </div>
          );
        })}
        <p className={issues.length ? styles.failing : styles.passing} aria-live="polite">
          {issues.length
            ? `${issues.length} rule${issues.length > 1 ? "s" : ""} failing: ${issues.map((i) => i.ruleId).join(", ")}`
            : "All rules pass."}
        </p>
      </form>
      <CodeBlock language="json" title="x-validonce">
        {JSON.stringify(props.xValidonce, null, 2)}
      </CodeBlock>
    </div>
  );
}
