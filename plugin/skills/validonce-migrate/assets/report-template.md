# validonce migration report: {Model / project}

- Date: {YYYY-MM-DD}
- Stack migrated from: {FluentValidation | Pydantic | Zod | Angular | yup}
- Server target: {C# ValidonceValidator<T> | Python ValidonceModel}
- Client wiring: {withRules | validonceGroupValidator | wrap | none}
- Branch / base commit: {name} / {sha}  (nothing was committed by the agent)

## Result

| | Count |
|---|---|
| Cross-field checks found | {n} |
| Migrated and proven (PASS) | {n} |
| Left hand-written | {n} |
| Divergences found and fixed along the way | {n} |

## Migrated rules

| Rule id | Kind | Old code (file:line) | New code (file:line) | Notes |
|---|---|---|---|---|
| {Model.kind.field} | {kind} | {path:line} | {path:line} | {path / server_only / message key} |

## Left hand-written

| Check | Where | Reason (one line) |
|---|---|---|
| {description} | {path:line} | {arithmetic / conditional format / async or database / cross-object / coercing comparison / needs services / diverged after two attempts} |

## Proof

Paste the `report` returned by `compare_results` here.

- Inputs file: {path}, {n} inputs, seed {n}, sha256 {hash}
- Runner: {name, version}; sandbox: {flags}; environment: {scrubbed? yes/no}
- Old validator ran only the migrated checks: {yes / scratch copy at path}

```text
{compare_results report}
```

## Divergences fixed

| Rule | Counterexample | Cause | Fix |
|---|---|---|---|
| {id} | `{input}` | {e.g. GreaterThan vs GreaterThanOrEqualTo} | {change} |

## Client changes

- {file}: {what was removed, what `withRules` / validator now covers}
- Tests and build after the change: {commands and results}

## Re-run the proof

```sh
{commands to regenerate inputs, run the runner, and compare}
```

## Follow-ups for the human

- {review the diff; the agent did not commit}
- {unmapped patterns worth telling the validonce maintainers about}
