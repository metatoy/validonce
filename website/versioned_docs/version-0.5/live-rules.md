# Loading rules at runtime

There are two ways for a client to get the server's rules:

- **At build time:** extract them into a file (`validonce extract`) or attach them to generated Zod schemas (`validonce wrap`). Rules change when you rebuild.
- **At runtime:** fetch the OpenAPI document when the page loads and read the rules from it. A rule change on the server reaches the form on the next page load, with no client release.

This page covers the runtime way. Both example forms use it.

## React

```ts
import { rulesFromOpenApi } from "validonce/openapi";
import type { RuleSet } from "validonce";

const [rules, setRules] = useState<RuleSet | null>(null);

useEffect(() => {
  fetch("/openapi/v1.json") // FastAPI: "/openapi.json"
    .then((r) => r.json())
    .then((doc: unknown) => {
      const rs = rulesFromOpenApi(doc, "Signup");
      if (!rs) throw new Error("no x-validonce rules for Signup");
      setRules(rs);
    });
}, []);
```

Then build the form schema with `withRules(SignupSchema, rules)` once the rules arrive. The full version, with loading and error states, is [`examples/react-form/src/App.tsx`](../examples/react-form/src/App.tsx).

## Angular

Fetch the document the same way (for example with `HttpClient`). For Signal Forms, build the schema with `withRules(baseSchema, rules)` once the rules arrive, as [`examples/angular-form/src/app.ts`](../examples/angular-form/src/app.ts) does. For Reactive Forms, add `validonceGroupValidator(rules)` to the form group.

## Things to know

- **Schema names.** `rulesFromOpenApi(doc, "Signup")` also finds `Signup-Input`, the name FastAPI gives a model's request schema.
- **Serve the document to your clients.** ASP.NET Core serves it at `/openapi/v1.json` with `MapOpenApi()`, FastAPI at `/openapi.json`. If you disable the document in production, use the build-time way instead.
- **Fail closed or open, deliberately.** If the fetch fails, the examples show an error and no form. Showing the form without rules is also safe, because the server still enforces every rule and answers 422. Users just see the error later.
- **Caching.** The document is a normal HTTP resource. Let your usual cache headers decide how quickly a rule change reaches clients.
- **Size.** You download the whole OpenAPI document. For large APIs, the build-time way gives a smaller bundle.
