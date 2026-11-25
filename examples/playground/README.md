# The playground

Pick a backend and a frontend, fill in a contact form, and watch the same rules run in the browser and
on the server.

| Folder | What it is |
|---|---|
| `frames/` | Four small frontends (React, Angular, Vue, web components) rendering the Contact form. They take `?api=`, `?openapi=` (or `?crd=`), `?schema=` and `?theme=`, and talk to the shell by `postMessage`. |
| `shell/` | The page: header, pickers, the iframe, the three panels, the shareable URL. React + Vite + TypeScript, static, dev port 5180. |
| `k8s/` | The Contact CRD (`contact-crd.json`, CEL) and `server.mjs`, a simulated Kubernetes API server (port 8060, no cluster). |
| `dev.sh` | Starts everything locally for manual testing. |

## The shell

- **State is in the URL:** `?backend=go&frontend=vue`. Backends: `aspnet`, `fastapi`, `fastify`, `nestjs`, `go`, `spring`, `k8s`. Frontends: `react`, `angular`, `vue`, `dom`.
- **Where the backends are** (`shell/src/backends.ts`): in dev, `localhost` ports 5080, 8010, 8020, 8030, 8040, 8050 (and 8060 for Kubernetes). A production build uses `https://play-<backend>.metatoy.com` (`play-aspnet`, `play-fastapi`, `play-fastify`, `play-nestjs`, `play-go`, `play-spring`, `play-k8s`); set `VITE_PLAYGROUND_API` at build time to use one base with `/<backend>` paths instead.
- **The "Rule in ..." panel** is cut from the real example files at build time (`shell/scripts/prepare.mjs`). Each backend's Contact rules sit between `playground:begin` and `playground:end` marker comments, so the panel can't drift from the code. Move the markers if you move the rules.
- **The "x-validonce" panel** is fetched live from the backend's OpenAPI document (for Kubernetes, translated from the CRD in the browser).
- **The numbers** (1, 2, 3) mark the server's issues in all three panels, matched by `ruleId`.
- **Build layout:** `prepare.mjs` copies the four built frames to `public/frames/` and the CRD to `public/k8s/`; `vite build` copies `public/` into `dist/`. One static site holds everything.

```sh
pnpm install
pnpm --filter validonce build
pnpm -r --filter "validonce-playground-frame-*" build   # the frames first
pnpm --filter validonce-playground-shell build          # shell/dist
pnpm --filter validonce-playground-shell e2e            # Playwright (Chromium) against a stub backend
```

## Kubernetes (simulated)

`k8s/contact-crd.json` is a Contact CRD whose CEL is equivalent to the four Contact rules. It uses `minLength: 1`, `has()` guards and `format: date` so every rule translates (see `docs/kubernetes.md`). The frames read it with `?crd=<url>` and `translateCrd`.

`k8s/server.mjs` evaluates the same rules on the server side with validonce's evaluator and answers a failure as a Kubernetes `Status` (reason `Invalid`, code 422, `details.causes`). It adds a top-level `validonce` list so the panels can number the issues; a real API server doesn't send that. The UI says "simulated".

## Run everything locally

```sh
bash examples/playground/dev.sh             # all six backends, the k8s stub and the shell
bash examples/playground/dev.sh go fastapi  # only those backends
```

Open http://localhost:5180. No Docker. It needs dotnet, uv, Go, a JDK, node and pnpm; ASP.NET and Spring take a while to start. Backend logs go to `examples/playground/.dev-<name>.log`. Ctrl-C stops everything.
