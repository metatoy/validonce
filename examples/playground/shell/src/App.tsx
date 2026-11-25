// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import darkLockup from "./assets/lockup-dark.svg?raw";
import lightLockup from "./assets/lockup-light.svg?raw";
import {
  BACKEND_IDS,
  BACKENDS,
  type BackendId,
  backendInfo,
  FRONTEND_IDS,
  FRONTENDS,
  type FrontendId,
  frameUrl,
} from "./backends";
import { type IssueLite, parseFrameEvent, type RequestRecord } from "./bridge";
import snippets from "./generated/snippets.json";
import { compactRulesLines, type Kind, type Line, KINDS, prettyLines, ruleIdOf, ruleRanges } from "./lines";
import { loadRules, type XValidonce } from "./rules";
import { tint } from "./tint";

const REPO = "https://github.com/metatoy/validonce";
type Theme = "light" | "dark";
type Tab = "rule" | "x" | "response";

// ---------------------------------------------------------------------------
// URL state: ?backend=go&frontend=vue
// ---------------------------------------------------------------------------

interface Selection {
  backend: BackendId;
  frontend: FrontendId;
}

function readSelection(): Selection {
  const p = new URLSearchParams(window.location.search);
  const b = p.get("backend");
  const f = p.get("frontend");
  return {
    backend: (BACKEND_IDS as readonly string[]).includes(b ?? "") ? (b as BackendId) : "aspnet",
    frontend: (FRONTEND_IDS as readonly string[]).includes(f ?? "") ? (f as FrontendId) : "react",
  };
}

function shareUrl(s: Selection): string {
  const u = new URL(window.location.href);
  u.search = `?backend=${s.backend}&frontend=${s.frontend}`;
  u.hash = "";
  return u.href;
}

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function storedTheme(): Theme | null {
  try {
    const t = localStorage.getItem("playground-theme");
    return t === "light" || t === "dark" ? t : null;
  } catch (_e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// The app
// ---------------------------------------------------------------------------

export function App() {
  const [sel, setSel] = useState<Selection>(readSelection);
  const [chosenTheme, setChosenTheme] = useState<Theme | null>(storedTheme);
  const [system, setSystem] = useState<Theme>(systemTheme);
  const theme = chosenTheme ?? system;
  const [skip, setSkip] = useState(false);
  const [tab, setTab] = useState<Tab>("rule");
  const [copied, setCopied] = useState(false);

  const [serverIssues, setServerIssues] = useState<IssueLite[]>([]);
  const [request, setRequest] = useState<RequestRecord | null>(null);
  const [rules, setRules] = useState<XValidonce | null>(null);
  const [rulesError, setRulesError] = useState<string | null>(null);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const skipRef = useRef(skip);
  skipRef.current = skip;

  // Theme: data-theme on <html> (the CSS also follows the system when nothing is chosen).
  useEffect(() => {
    const root = document.documentElement;
    if (chosenTheme) root.dataset.theme = chosenTheme;
    else delete root.dataset.theme;
  }, [chosenTheme]);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => setSystem(mq.matches ? "dark" : "light");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setChosenTheme(next);
    try {
      localStorage.setItem("playground-theme", next);
    } catch (_e) {
      // private window: the choice just isn't remembered
    }
  };

  // Selection <-> URL.
  const choose = (next: Partial<Selection>) => {
    const merged = { ...sel, ...next };
    window.history.pushState(null, "", shareUrl(merged));
    setSel(merged);
  };
  useEffect(() => {
    const on = () => setSel(readSelection());
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);

  // The theme in the URL is only the frame's first paint; changes are sent live (no reload).
  const firstTheme = useRef(theme);
  const src = useMemo(
    () => frameUrl(sel.frontend, sel.backend, firstTheme.current),
    [sel.frontend, sel.backend],
  );
  const frameOrigin = useMemo(() => new URL(src).origin, [src]);

  const themeRef = useRef(theme);
  themeRef.current = theme;
  const post = useCallback(
    (message: Record<string, unknown>) => {
      iframeRef.current?.contentWindow?.postMessage(message, frameOrigin);
    },
    [frameOrigin],
  );
  // The frame's settings: sent when it says it is ready, and again when they change.
  const postSkip = useCallback(() => {
    post({ type: "validonce:set", skipClient: skipRef.current });
    post({ type: "validonce:set", theme: themeRef.current });
  }, [post]);

  // A new frame starts clean.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset when the frame URL changes
  useEffect(() => {
    setServerIssues([]);
    setRequest(null);
  }, [src]);

  // Messages from the frame: only from our iframe's window and origin.
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.origin !== frameOrigin) return;
      if (e.source !== iframeRef.current?.contentWindow) return;
      const ev = parseFrameEvent(e.data);
      if (!ev) return;
      if (ev.type === "ready") postSkip();
      else if (ev.type === "issues" && ev.source === "server") setServerIssues(ev.issues);
      else if (ev.type === "request") setRequest(ev.record);
    };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, [frameOrigin, postSkip]);

  // The toggle goes to the frame.
  // biome-ignore lint/correctness/useExhaustiveDependencies: send when the toggle changes
  useEffect(() => {
    postSkip();
  }, [skip, postSkip]);

  useEffect(() => {
    post({ type: "validonce:set", theme });
  }, [theme, post]);

  // x-validonce from the live OpenAPI document (or the translated CRD).
  useEffect(() => {
    let live = true;
    setRules(null);
    setRulesError(null);
    loadRules(sel.backend).then(
      (r) => live && setRules(r),
      (e: unknown) => live && setRulesError(String(e instanceof Error ? e.message : e)),
    );
    return () => {
      live = false;
    };
  }, [sel.backend]);

  // The numbers: server issues, in the order the server sent them, one per rule id.
  const numbers = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of serverIssues) if (!m.has(i.ruleId)) m.set(i.ruleId, m.size + 1);
    return m;
  }, [serverIssues]);

  // The numbers also go to the frame, by field: the first server issue on a field is the one it shows.
  useEffect(() => {
    const byField: Record<string, number> = {};
    for (const i of serverIssues) {
      const field = i.path[0];
      const n = numbers.get(i.ruleId);
      if (field && n && byField[field] === undefined) byField[field] = n;
    }
    post({ type: "validonce:markers", byField });
  }, [serverIssues, numbers, post]);

  const kindOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rules?.rules ?? []) m.set(r.id, r.kind);
    return m;
  }, [rules]);

  const backend = backendInfo(sel.backend);
  const frontend = FRONTENDS.find((f) => f.id === sel.frontend) ?? (FRONTENDS[0] as (typeof FRONTENDS)[number]);
  const link = shareUrl(sel);
  const shown = link.replace(/^https?:\/\//, "");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (_e) {
      window.prompt("Copy this link", link);
    }
  };

  return (
    <div className="page">
      <header className="top">
        <a className="brand" href={REPO} aria-label="validonce">
          <span className="lockup lockup-light" dangerouslySetInnerHTML={{ __html: lightLockup }} />
          <span className="lockup lockup-dark" dangerouslySetInnerHTML={{ __html: darkLockup }} />
        </a>
        <span className="product">Playground</span>
        <nav className="toplinks">
          <button type="button" className="theme" onClick={toggleTheme} data-testid="theme-toggle" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
            {theme === "dark" ? "☀ Light" : "☾ Dark"}
          </button>
          <a href={REPO}>GitHub</a>
          <a href={`${REPO}/tree/main/docs`}>Docs</a>
        </nav>
      </header>

      <section className="pickers" aria-label="Pick a backend and a frontend">
        <Picker
          title="Backend"
          testId="backend"
          value={sel.backend}
          items={BACKENDS.map((b) => ({ id: b.id, label: b.label, sub: b.sub, tag: b.simulated ? "simulated server" : undefined }))}
          onPick={(id) => choose({ backend: id as BackendId })}
        />
        <Picker
          title="Frontend"
          testId="frontend"
          value={sel.frontend}
          items={FRONTENDS.map((f) => ({ id: f.id, label: f.label, sub: f.sub }))}
          onPick={(id) => choose({ frontend: id as FrontendId })}
        />
      </section>

      <div className="share">
        <span className="share-label">Shareable link</span>
        <code className="share-url" data-testid="share-url">{shown}</code>
        <button type="button" className="pill-btn" onClick={copy} data-testid="copy-link">
          {copied ? "copied" : "copy"}
        </button>
      </div>

      <div className="stage">
        <section className="card form-card" aria-label="Contact signup">
          <div className="card-head">
            <h2>Contact signup</h2>
            <span className="pill">{frontend.label} form · {backend.label} API</span>
          </div>
          {backend.simulated && (
            <p className="note" data-testid="simulated-note">
              <strong>Simulated.</strong> There is no cluster: a small Node handler runs the CRD's
              rules and answers in the Kubernetes <code>Status</code> shape. CI checks the
              translation against real Kubernetes CEL.
            </p>
          )}
          {skip && (
            <p className="note ok" data-testid="skip-note">
              <strong>Browser checks are off.</strong> Submit goes to the {backend.label} server. Its
              422 lands on the same fields, numbered to match the response.
            </p>
          )}
          <iframe
            ref={iframeRef}
            className="frame"
            title={`Contact form (${frontend.label}) talking to ${backend.label}`}
            src={src}
            data-testid="frame"
          />
          <label className="skip">
            <input
              type="checkbox"
              role="switch"
              checked={skip}
              onChange={(e) => setSkip(e.target.checked)}
              data-testid="skip-toggle"
            />
            <span className="switch" aria-hidden="true" />
            <span>
              <strong>Skip browser checks</strong>
              <small>{skip ? "on · requests go straight to the server" : "off · errors appear as you type"}</small>
            </span>
          </label>
        </section>

        <div className="panels">
          <div className="tabs" role="tablist" aria-label="Panels" data-testid="tabs">
            {(
              [
                ["rule", `Rule in ${snippets[backend.id].language}`],
                ["x", "x-validonce"],
                ["response", "Server response"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={tab === id ? "on" : ""}
                onClick={() => setTab(id)}
                data-testid={`tab-${id}`}
              >
                {label}
              </button>
            ))}
          </div>

          <RulePanel active={tab === "rule"} backend={backend.id} language={snippets[backend.id].language} file={snippets[backend.id].file} code={snippets[backend.id].code} numbers={numbers} kindOf={kindOf} />
          <XPanel active={tab === "x"} backend={backend.id} rules={rules} error={rulesError} numbers={numbers} />
          <ResponsePanel active={tab === "response"} request={request} numbers={numbers} />
        </div>
      </div>

      <section className="flow" aria-label="How it works">
        <Step n={1} title="Server rule" text={`written once, in ${snippets[backend.id].language}`} />
        <span className="arrow" aria-hidden="true">→</span>
        <Step n={2} title={backend.id === "k8s" ? "CRD x-validonce" : "OpenAPI x-validonce"} text={backend.id === "k8s" ? "translated from the CEL in the browser" : "exported in the spec"} />
        <span className="arrow" aria-hidden="true">→</span>
        <Step n={3} title="Browser, same 422 back" text="enforced as you type; server agrees" />
      </section>

      <footer className="foot">
        <strong>Run it yourself</strong>
        <a className="btn" href="https://codespaces.new/metatoy/validonce">Open {backend.label} + {frontend.label} in Codespaces</a>
        <a href={`${REPO}/blob/main/docs/${backend.doc}`}>
          {backend.id === "k8s" ? "Kubernetes guide" : `Getting started: ${backend.sub === "Huma" ? "Go" : backend.label}`} →
        </a>
        <span className="grow" />
        <a href={REPO}>github.com/metatoy/validonce</a>
        <small>Apache-2.0 · Metatoy LLC</small>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

interface Item {
  id: string;
  label: string;
  sub: string;
  tag?: string;
}

/** Chips on desktop, a select on mobile (the CSS shows one of them). */
function Picker(props: { title: string; testId: string; value: string; items: Item[]; onPick: (id: string) => void }) {
  return (
    <div className="picker">
      <h3>{props.title}</h3>
      <div className="chips" role="radiogroup" aria-label={props.title}>
        {props.items.map((it) => (
          <button
            key={it.id}
            type="button"
            role="radio"
            aria-checked={props.value === it.id}
            className={`chip${props.value === it.id ? " on" : ""}`}
            onClick={() => props.onPick(it.id)}
            data-testid={`${props.testId}-${it.id}`}
          >
            <b>{it.label}</b>
            <span>{it.sub}</span>
            {it.tag && <em className="tag">{it.tag}</em>}
          </button>
        ))}
      </div>
      <select
        className="select"
        aria-label={props.title}
        value={props.value}
        onChange={(e) => props.onPick(e.target.value)}
        data-testid={`${props.testId}-select`}
      >
        {props.items.map((it) => (
          <option key={it.id} value={it.id}>
            {it.label} — {it.sub}
            {it.tag ? ` (${it.tag})` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

function Step(props: { n: number; title: string; text: string }) {
  return (
    <div className="step">
      <b>{props.n} · {props.title}</b>
      <span>{props.text}</span>
    </div>
  );
}

function Num({ n }: { n: number | undefined }) {
  return n ? <b className="num" data-testid={`marker-${n}`}>{n}</b> : null;
}

function Code({ lines, numbers }: { lines: Line[]; numbers: Map<string, number> }) {
  return (
    <pre className="code">
      {lines.map((l, i) => {
        const n = l.tag ? numbers.get(l.tag) : undefined;
        // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional
        return (
          <div key={i} className={n ? "ln hit" : "ln"}>
            <span className="gut"><Num n={n} /></span>
            <span className="txt">{tint(l.text)}</span>
          </div>
        );
      })}
    </pre>
  );
}

function Panel(props: { active: boolean; id: string; title: string; meta?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className={`card panel${props.active ? " active" : ""}`} data-testid={`panel-${props.id}`} role="tabpanel">
      <div className="card-head">
        <h2>{props.title}</h2>
        <span className="meta">{props.meta}</span>
      </div>
      {props.children}
    </section>
  );
}

function RulePanel(props: { active: boolean; backend: BackendId; language: string; file: string; code: string; numbers: Map<string, number>; kindOf: Map<string, string> }) {
  const lines: Line[] = useMemo(() => {
    const raw = props.code.split("\n");
    const out: Line[] = raw.map((text) => ({ text }));
    const ranges = ruleRanges(props.backend, props.code);
    for (const [ruleId] of props.numbers) {
      const k: Kind | undefined = (props.kindOf.get(ruleId) as Kind | undefined) ?? KINDS.find((x) => ruleId.includes(x));
      const r = k ? ranges[k] : undefined;
      if (!r) continue;
      for (let i = r[0]; i <= r[1]; i++) (out[i] as Line).tag = ruleId;
    }
    return out;
  }, [props.backend, props.code, props.numbers, props.kindOf]);
  return (
    <Panel active={props.active} id="rule" title={`Rule in ${props.language}`} meta={props.file}>
      <Code lines={lines} numbers={props.numbers} />
    </Panel>
  );
}

function XPanel(props: { active: boolean; backend: BackendId; rules: XValidonce | null; error: string | null; numbers: Map<string, number> }) {
  const lines = useMemo(
    () => (props.rules ? compactRulesLines(props.rules) : []),
    [props.rules],
  );
  const meta = props.backend === "k8s" ? "translateCrd(contact-crd.json)" : "from the OpenAPI document";
  return (
    <Panel active={props.active} id="x" title="x-validonce" meta={meta}>
      {props.error ? (
        <p className="empty err" data-testid="x-error">Could not load the rules: {props.error}</p>
      ) : props.rules ? (
        <Code lines={lines} numbers={props.numbers} />
      ) : (
        <p className="empty">Loading the rules…</p>
      )}
    </Panel>
  );
}

function ResponsePanel(props: { active: boolean; request: RequestRecord | null; numbers: Map<string, number> }) {
  const r = props.request;
  const lines = useMemo(() => (r ? prettyLines(r.body, ruleIdOf) : []), [r]);
  return (
    <Panel
      active={props.active}
      id="response"
      title="Server response"
      meta={r && <span className={`status s${r.status >= 400 || r.status === 0 ? "bad" : "ok"}`} data-testid="status">{r.status || "network error"}</span>}
    >
      {r ? (
        <>
          <p className="reqline" data-testid="request-line">{r.method} {r.url.replace(/^https?:\/\//, "")} · {r.ms} ms</p>
          <Code lines={lines} numbers={props.numbers} />
        </>
      ) : (
        <p className="empty">Submit the form (with “Skip browser checks” on) to see the server's answer.</p>
      )}
    </Panel>
  );
}
