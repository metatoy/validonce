// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

// The same Contact rules in every backend, cut from the example apps at build time
// (scripts/prepare.mjs). groupId syncs every StackTabs on the site, and the choice is kept
// in the URL (?stack=go) and in the browser, so picking Go once shows Go everywhere.

import CodeBlock from "@theme/CodeBlock";
import TabItem from "@theme/TabItem";
import Tabs from "@theme/Tabs";
import type { ReactNode } from "react";
import snippets from "../../generated/snippets.json";

type Snippet = { label: string; file: string; language: string; code: string };
const ALL = snippets as Record<string, Snippet>;

export default function StackTabs(props: { only?: string[] }): ReactNode {
  const ids = props.only ?? Object.keys(ALL);
  return (
    <Tabs groupId="stack" queryString="stack">
      {ids.map((id) => {
        const s = ALL[id];
        if (!s) throw new Error(`StackTabs: no snippet "${id}"`);
        return (
          <TabItem key={id} value={id} label={s.label}>
            <CodeBlock language={s.language} title={s.file}>
              {s.code}
            </CodeBlock>
            <p>
              From{" "}
              <a href={`https://github.com/metatoy/validonce/blob/main/${s.file}`}>{s.file}</a>, the
              example app that runs in the playground.
            </p>
          </TabItem>
        );
      })}
    </Tabs>
  );
}
