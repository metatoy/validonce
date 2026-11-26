// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import Link from "@docusaurus/Link";
import Layout from "@theme/Layout";
import type { ReactNode } from "react";
import StackTabs from "../components/StackTabs";

// Landing copy: a draft, reviewed before the site is announced.
const FEATURES = [
  {
    title: "Rules travel as data",
    body: "Cross-field rules are exported in the OpenAPI document under x-validonce. No code is generated or copied into the browser.",
  },
  {
    title: "Six backends, four frontends",
    body: "ASP.NET Core, FastAPI, Fastify, NestJS, Go and Spring Boot on the server. React, Angular, Vue and plain web forms in the browser.",
  },
  {
    title: "The server still decides",
    body: "Every request is checked again on the server. A broken rule returns 422 with the same issue shape the form already shows.",
  },
];

export default function Home(): ReactNode {
  return (
    <Layout
      title="Cross-field validation, written once"
      description="Write cross-field validation rules once on the server and enforce the same rules in the browser."
    >
      <header className="hero hero--validonce">
        <div className="container">
          <h1>Write the rule once. Enforce it everywhere.</h1>
          <p className="hero__subtitle">
            validonce takes the cross-field rules your server already checks, such as "company is
            required when the plan is Pro", and runs the same rules in the browser.
          </p>
          <div className="hero__buttons">
            <Link className="button button--primary button--lg" to="/quickstart">
              Choose your stack
            </Link>
            <Link className="button button--secondary button--lg" to="/docs/how-it-works">
              How it works
            </Link>
            <Link className="button button--secondary button--lg" href="https://playground.metatoy.com">
              Try the playground
            </Link>
          </div>
        </div>
      </header>
      <main className="container features">
        <div className="row">
          {FEATURES.map((f) => (
            <div key={f.title} className="col col--4">
              <h2>{f.title}</h2>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
        <h2 className="margin-top--xl">The same rules, in every stack</h2>
        <p>
          The four Contact rules from the playground, as each example backend writes them. Pick your
          server and every code sample on the site follows.
        </p>
        <StackTabs />
      </main>
    </Layout>
  );
}
