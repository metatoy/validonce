# Plugin evals

Cases for `claude plugin eval`, which runs each prompt with and without the plugin and reports the difference. The manifest points here (`experimental.evals` in `.claude-plugin/plugin.json`). The full migration evals, which run the old validators and the differential proof, are in `mcp/evals/`.

| Case | Checks |
|---|---|
| `pydantic-classify` | Sorts three Pydantic checks into a `compare`, an `at_least_one_of` and one kept hand-written (arithmetic) |
| `fluentvalidation-classify` | Sorts three FluentValidation rules into a `required_when`, a strict `gt` compare and one kept hand-written (async lookup) |
| `zod-react-classify` | Zod `superRefine` in a React form: a date `compare` (`ge`), a password `eq`, and a country-gated age check kept hand-written |
| `angular-classify` | Angular group validators: `at_least_one_of`, `exactly_one_of`, and an async API check kept hand-written |
| `veevalidate-vue-classify` | VeeValidate with yup in Vue: `required_when`, `all_or_none`, and an arithmetic discount check kept hand-written |
| `unrelated-no-trigger` | The skill stays out of an unrelated request |

The cases ask for a classification and draft rules only, so no MCP server or old validator runs. Run from the repo root:

```
claude plugin eval . --runs 2 --judge-model sonnet --no-publish
```

Each run is a real model call on your account. Results go to `plugin-evals/results/` (ignored by git).
