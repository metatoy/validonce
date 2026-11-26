# Where Kubernetes CEL and validonce agree

Status: spike result, 2026-11-24. Every claim below comes from a fixture run (id and both verdicts quoted). To reproduce:

```
pnpm install && pnpm -C js build            # once, repo root
cd tools/k8s-cel-diff
node gen-fixtures.mjs                        # writes conformance/kubernetes/*.json (committed)
go run . -json > out/verdicts.json           # Kubernetes verdicts (out/ is git-ignored)
node compare.mjs [--all] [--case=<id prefix>]   # runs js/dist evaluate() on each case's `validonce` rule and diffs
```

## What was run

- **Go program** (`main.go`): for every input it does what the API server does to a custom resource, in the same order (`customresource_handler.go`, `registry/customresource/strategy.go`):
  1. prune unknown fields (`structuralpruning.Prune`);
  2. drop non-nullable nulls that have no default (`PruneNonNullableNullsWithoutDefaults`);
  3. apply defaults (`structuraldefaulting.Default`);
  4. OpenAPI schema validation (`apiservervalidation.ValidateCustomResource`: type, `required`, `minLength`, `format`, …);
  5. CEL (`k8s.io/apiextensions-apiserver/pkg/apiserver/schema/cel`, the same `Validator` the server uses, with the server's per-call limit and cost budget).
  The JSON is decoded with the server's decoder (`UnmarshalCaseSensitivePreserveInts`).
- **Not a live cluster.** There is no kube-apiserver or etcd. This is the server's own library driven directly, so CEL environment, type declarations, `has()`, null handling and error text are the server's. Not covered: ratcheting, `oldSelf` / transition rules, `x-kubernetes-preserve-unknown-fields`, embedded resources, and the CRD-admission static cost estimate (a rule over unbounded strings/lists can be refused when the CRD is created; fixtures use no such rules).
- **Verdicts:** `pass`; `fail` (the rule is false, 422); `error` (rule compile error or runtime error such as `no such key: a evaluating rule: …`, also a 422); `rejected` (step 4 already rejected the object; `celAlso` records what CEL would say, or `skipped`; the server skips CEL on `Required`/`TypeInvalid`/`TooLong`/`TooMany`/`NotSupported` schema errors, but not on `minLength` or `format` errors).
- **validonce side** (`compare.mjs`): `evaluate()` from `js/dist` on the hand-written rule stored in each case under `validonce`, fed the original input (a client form has not been pruned or defaulted).
- **Corpus:** 104 cases, 2,205 inputs in `conformance/kubernetes/{10..60}-*.json`. Result: **1,388 agree · 275 differ (131 where validonce blocks something Kubernetes accepts, 144 where validonce is lenient) · 374 Kubernetes errors (362 where validonce says pass) · 168 rejected before CEL.**

**Direction matters.** *Strict* (validonce fails, Kubernetes passes) is a bug: the client blocks input the server accepts. *Lenient* (validonce passes, Kubernetes fails or errors) is tolerable: the server still enforces the rule, and the dry-run helper reports it. An *exact* row below means zero strict and zero lenient differences, and no Kubernetes runtime errors, for every input that gets past step 4, under the stated guard.

## Verdict table

| # | Translation-table row | Verdict | Guard |
|---|---|---|---|
| 1 | `!(cond) \|\| has(self.f)` and `cond ? has(self.f) : true` → `required_when` | **exact with a guard** | G-blank on `f` (and on every field used by `present`/`absent`); G-key on every field used by `eq`/`ne`/`in`; no `default` on any field the rule reads |
| 1a | conditions `&&` `\|\|` `!` → `all` `any` `not` | **exact** | none beyond the leaf conditions |
| 1b | `has(self.x)` / `!has(self.x)` → `present` / `absent` | **exact with a guard** | G-blank |
| 1c | `self.x == lit`, `!=`, `in [lits]` → `eq` / `ne` / `in` | **exact with a guard** | G-key; literal type equal to the field type |
| 2 | `self.a <op> self.b`, `self.a <op> lit` (int/double) → `compare` number | **exact with a guard** | G-missing; integers within ±2^53; mixed int/double operands only for `<` `<=` `>` `>=` (`==`/`!=` do not compile) |
| 3 | the same on strings → `compare` string | **exact with a guard** | G-missing and G-blank on every operand |
| 4a | `format: date` fields (`self.a <= self.b`, or `timestamp()` wrapped) → `compare` date | **exact with a guard** | G-missing; year `0000` is the only residue (lenient) |
| 4b | `format: date-time` fields → `compare` datetime | **exact with a guard** | G-missing; fraction digits limited to 3 by a `pattern`, otherwise **drop** |
| 4c | `timestamp(self.a)` on plain (no `format`) strings | **drop** | `server_only` |
| 5 | `has(a) \|\| has(b) \|\| …` → `at_least_one_of` | **exact with a guard** | G-blank on every member |
| 6 | `[has(a), has(b)].exists_one(x, x)`, sum-of-ternaries `== 1` → `exactly_one_of` | **exact with a guard** | G-blank on every member |
| 7 | `has(a) == has(b)`, n-field all/none → `all_or_none` | **exact with a guard** | G-blank on every member |
| 8 | anything else → `server_only` + `params.cel` | n/a | nothing to prove |

### The guards, stated precisely

- **G-blank (a field cannot be present-but-blank).** `has()` is true for `""` and `[]`; validonce calls both blank. The field must be one of: a string with `minLength` ≥ 1 (or an `enum`/`pattern` that excludes `""`); an array with `minItems` ≥ 1; or an integer, number, boolean or object (where `0`, `false` and `{}` are present in both worlds). Nullability does not matter (see "Surprises", 1). The field must have no `default` (defaulting makes `has()` true for every object, so a missing value in the client form is a false "absent").
- **G-key (a condition field is always readable).** `self.x` on a missing field is a runtime error (`no such key: x`), a 422. So the field must be in the schema's `required` list, or have a `default`, or the CEL must carry its own guard: `has(self.x) && self.x == lit` (`eq`, `in`) or `!has(self.x) || self.x != lit` (`ne`; validonce's `ne` is true for a blank field). With the guard written in, `eq` and `ne` are exact for optional fields too.
- **G-missing (operand always readable, or explicitly skipped).** Both operands in `required` (or defaulted), or the CEL is `!has(self.a) || !has(self.b) || self.a <op> self.b`, which is exactly validonce's "skip when blank". The bare `self.a <op> self.b` on optional operands is a runtime error whenever either side is missing.

## Evidence, row by row

(`a/b` are the two operands; "k8s" is the Kubernetes verdict, "vo" the validonce one. `--all --case=<id>` prints every input.)

### 1. `has(self.f)` versus blank → `required_when`, `present`, `absent`

| Value of `f` (plan = `pro`) | k8s `has` | validonce blank | Fixture |
|---|---|---|---|
| missing | false | blank | `has.rw.string.nonnull` · k8s fail, vo fail |
| explicit `null`, **non-nullable** field | false (the server drops the null before CEL) | blank | `has.rw.string.nonnull` `f=null` · fail/fail |
| explicit `null`, **`nullable: true`** | **false** | blank | `has.rw.string.nullable` `f=null` · fail/fail |
| `""` | **true** | blank | `has.rw.string.nonnull` `f=""` · k8s pass, vo fail (**strict**) |
| `[]` | **true** | blank | `has.rw.array.nonnull` `f=[]` · pass / fail (**strict**) |
| `{}`, `0`, `false`, `" "` | true | not blank | `has.rw.{object,integer,boolean,string}.*` · agree, all 5 inputs each |

- **Nullable is not a hazard for `has()`.** Across string, array, object, integer and boolean (nullable and not), `null` and missing give the same answer. Both `*.nonnull` and `*.nullable` fixtures show identical results (1 strict difference each, the `""` or `[]` one).
- **The only blank-semantics gap is `""` and `[]`.** Measured over the whole corpus: every difference in rows 1, 3, 5, 6, 7 has `""` or `[]` in its data, except the four non-blank causes listed below (defaults, sub-millisecond timestamps, year `0000`, integers above 2^53).
- **Guard works.** `has.rw.string.minLength1` and `has.rw.array.minItems1`: the blank input is `rejected` by the schema (`f in body should be at least 1 chars long`), everything else agrees. Same for `has.cond.present.minLength1` (g side). Note the guard has to cover `f` too: `has.cond.present.minLength1` still has 1 strict difference (`g="x" f=""`) because only `g` carried `minLength`.
- **Defaults break it.** `has.rw.string.default`: `f` missing, k8s pass (the server wrote `"d"` first), vo fail. 3 strict differences of 4. A default on an `eq` condition field is the same hazard when the default equals the literal; `eq.default.eq` (default `free`, literal `pro`) agrees 16/16 and does not exercise that case.
- **`required` is harmless but vacuous.** `has.rw.string.required`: missing/null are rejected at step 4 (`Required value`), and CEL is skipped.
- **Ternary** (`cond ? has(f) : true`) is identical to the `||` form: `has.ternary` · 5 agree, 1 strict (`f=""`).
- **Boolean composition is exact.** `has.cond.all`, `has.cond.any`, `has.cond.not`: the only differences are the `""` ones from `present`/`absent` (any: 6/6 agree).
- **`present` / `absent` leaf conditions:** `has.cond.present.*`, `has.cond.absent.*`: 16 inputs each, all differences involve `""` on `g` or `f`; with `minLength: 1` on `g`, `g=""` is rejected and the rest agree.

### 1c. `eq` / `ne` / `in`, type mismatch, unset operands (`20-eq-ne-in.json`)

- **Unguarded on an optional field: runtime error.** `eq.optional.eq` `plan=MISSING`: k8s **error** `no such key: plan evaluating rule: …`, vo pass. Same for `ne` (`eq.optional.ne`: error vs vo **fail**, since `ne` is true for blank) and `in` (`eq.optional.in`). A nullable `plan` with explicit `null` is the same: `eq.nullable.string` `plan=null` → `no such key: plan` error.
- **With the guard it is exact.** `eq.guarded.eq` (`has(self.plan) && self.plan == 'pro'`): 16/16; `eq.guarded.in`: 16/16; `eq.guarded.ne` (`!has || !=`): 9/9; `eq.nullable.string.guarded`: 4/4. `plan` in `required`: nothing to disagree about (`eq.required.eq`: missing is rejected; the one difference is `f=""` again). `plan` with a default: `eq.default.eq` 16/16.
- **Case, trailing space, accents are strict in both:** `eq.string.case` 16/16 (`"pro"` vs `"Pro"`, `"pro "`, `"pró"`).
- **Types.** Integer vs int literal, boolean vs `true`, int-or-string vs `'pro'` / `1` all agree (`eq.int.eqlit` 7 agree, `eq.bool` 4/4, `eq.bool.bare` 4/4, `eq.intorstring.string` 8/8, `eq.intorstring.int` 6/6: with `x-kubernetes-int-or-string`, `v == 1` is false for `"1"` in both).
- **Type mismatch is a compile error, not a runtime one.** `eq.mismatch.int-vs-string` (`self.n == 'a'`): `found no matching overload for '_==_' applied to '(int, string)'`; same for `in` with a string list on an int field and for a string field `== 1`. On a real cluster the CRD is refused at creation, so a translator never sees these. It should still treat any rule it cannot type from the schema as `server_only`.
- **A `number` field cannot be `== 1`**, only `== 1.0`/`1.5` (`eq.double.eqint`: compile error on `(double, int)`; `eq.double.eqdbl`: 6/6 agree). The translator must derive the literal's type from the schema.
- **Integer sent as `1.0`:** step 4 accepts it, CEL errors `invalid data, expected int, got float64` (`eq.int.eqlit` `n=1.0`). A data error, not a translator concern.

### 2. Number comparisons (`30-compare-number.json`)

- **int/int, all six operators:** `num.int-int.{lt,le,gt,ge,eq,ne}`: 16 agree each on present operands; **20 of 36 inputs are errors** because the bare rule errors when either side is missing or `null` (`no such key: a`), where vo skips (`vo=pass`). `num.int-int.guarded` (`!has(a) || !has(b) || a <= b`): 36/36 agree. `num.int-int.required`: missing is rejected at step 4; the rest agree.
- **double/double:** `num.dbl-dbl.le`: 36/36, including `0.1`, `0.2`, `0.30000000000000004`, `0.3` (both are IEEE doubles).
- **Mixed int and double.** Ordering works: `num.int-dbl.le`, `num.dbl-int.le` (6/6 each, e.g. `a=2` int vs `b=1.5` number → fail/fail). `==` and `!=` do **not compile** (`found no matching overload for '_==_' applied to '(int, double)'`: `num.int-dbl.eq`, `num.dbl-int.eq`). So mixed equality never reaches a translator.
- **Literals.** `self.a >= 0` (int field): `num.lit.int-ge0` 5/5 with a `has()` guard, error on missing without one (`num.lit.int-ge0.noguard`). A number field against an int literal (`self.a >= 1`, `num.lit.dbl-ge-int`) compiles and agrees 3/3; an int field against a double literal (`num.lit.int-ge-dbl`) 2/2; `num.lit.dbl-ge-dbl` 3/3.
- **Beyond 2^53 they differ.** `num.int.big`: `a=9007199254740993, b=9007199254740992`, `a <= b`: k8s **fail** (CEL ints are exact int64), vo **pass** (IEEE doubles; JavaScript cannot even hold `a`). Lenient, and only reachable above 2^53, hence the ±2^53 guard.

### 3. Strings (`40-compare-string.json`)

- **Ordering and equality agree exactly for every non-empty pair.** In `str.{lt,le,eq,ne}` (144 inputs each) every difference is an `""` operand. Covered: case (`"a" < "B"` is false in both: ordinal), accents (`"é" < "f"` false in both), `"é"` (U+00E9) versus `"e"+U+0301` (not equal in both: no normalisation), and **U+FFFF versus U+10000** (`"￿" < "\u{10000}"` pass/pass: CEL compares code points like validonce rule 6, not UTF-16 units).
- **The only gap is `""`.** CEL compares `""` as a value (`"" < "a"` true); validonce skips it as blank. `str.lt` `a="a" b=""`: k8s fail, vo pass; `str.eq` `a="" b="a"`: fail/pass. All the `""` differences are lenient (validonce skips, Kubernetes judges); the guard is there so the row has zero differences, not because the client would block anything.
- **Guarded.** `str.le.minLength1` (has() guards + `minLength: 1`): 9/9 agree, `""` rejected at step 4. `str.le.guarded` without `minLength` still differs on `""` (`a="x" b=""`: k8s fail, vo pass).
- **Literal.** `str.lit.lt` (`!has(a) || a < 'm'`): 6/6.

### 4. Dates and timestamps (`50-datetime.json`)

**Typing first.** In Kubernetes CEL a string with `format: date` or `format: date-time` is a CEL **timestamp**, not a string. So `self.a <= self.b` compares instants directly (`ts.native.date`, `ts.native.datetime`), `timestamp(self.a)` is accepted as a no-op (`ts.wrapped.date`), and `timestamp(self.a + 'T00:00:00Z')` does **not compile** on such a field (`found no matching overload for '_+_' applied to '(timestamp, string)'`, `ts.date.concat`). On a plain string the `timestamp()` call parses it.

- **Step 4 already validates format fields.** `format: date-time` rejects: no offset (`2026-01-02T10:00:00`), date only (`2026-01-02`), `24:00:00`, leap second `23:59:60`, `2026-02-30`, `""`, `"x"`; `format: date` rejects `2026-02-29` (non-leap), `2026-1-2`, `""` (`ts.native.*`, `ts.le.date-time`). So for these fields the blank/garbage inputs never reach CEL, and G-blank is automatic.
- **Date (4a).** `ts.native.date`: 6 agree, 4 rejected. Includes `0000-01-01` and `9999-12-31`. `ts.wrapped.date` identical. Guarded form (`ts.native.date.guarded`): 9 agree, 7 rejected. Unguarded on an optional operand: error (`ts.native.date.unguarded`: 8 `no such key`). One residue: k8s accepts year `0000`, validonce skips it: `str.date-lexical` `a="2026-01-02" b="0000-01-01"`, `a <= b` → k8s fail, vo pass (lenient).
- **Date-time with offsets (4b).** `Z`, `+05:30`, `-00:00`, `-05:00` all agree as instants (`ts.eq.offset` 3/3, `ts.native.datetime` rows 1, 2, 5). Guarded form 9/9 (`ts.native.datetime.guarded`); `ts.native.datetime.lit` (`self.a >= timestamp('2026-01-01T00:00:00Z')`) 3/3; same with `timestamp()` (`ts.lit`) 3/3.
- **Sub-millisecond precision is a strict difference.** validonce compares at millisecond precision (rule 8); CEL keeps nanoseconds. `ts.gt.subms`: `a=…00.0009Z`, `b=…00.0001Z`, `a > b`: k8s **pass**, vo **fail** (both read as .000). `ts.native.datetime.gt`: same. Also `ts.native.datetime` `a=…00.0004Z` `<=` `…00Z`: k8s fail, vo pass. Hence the `pattern` guard (≤ 3 fraction digits), or drop.
- **Values CEL and the `format` check disagree about.** `2026-01-02t10:00:00z` (lowercase): passes step 4, then CEL errors (`Invalid date-time formatted string … parsing time`); validonce treats it as a type failure and skips. `…+24:00`: CEL accepts it as an instant, validonce skips it (offset hours 00–23). `0000-01-01T00:00:00Z`: CEL accepts on `format: date-time` fields; on a plain string `timestamp()` errors `timestamp overflow`. All three are lenient or server-side errors, never strict.
- **Plain strings with `timestamp()` (4c): drop.** `ts.le.noformat`: 10 of 16 inputs are CEL runtime errors (`type conversion error from 'string' to 'google.protobuf.Timestamp'` for `""`, `"2026-01-02"`, `"x"`, no offset, lowercase, `24:00`, Feb 30; `timestamp overflow` for year 0). validonce skips each of those. `ts.le.optional` (no guard): 15 of 16 inputs error, including every `""` and every missing side. `ts.le.guarded` still errors on `""` (3 of 16) because `""` is present. The input a console would send for an empty date box is `""`, so the plain-string form cannot be exact without an explicit `format`.

### 5–7. `at_least_one_of`, `exactly_one_of`, `all_or_none` (`60-groups.json`)

Each case enumerates every combination of `{missing, null, "", "x"}` over the 2 or 3 members (64 or 16 inputs).

| Fixture | agree | strict | lenient | rejected |
|---|---|---|---|---|
| `grp.at_least_one.3` (`has(a)\|\|has(b)\|\|has(c)`) | 45 | 19 | 0 | 0 |
| `grp.exactly_one.exists_one` | 37 | 12 | 15 | 0 |
| `grp.exactly_one.sum` (sum of ternaries `== 1`) | 37 | 12 | 15 | 0 |
| `grp.all_or_none.2` (`has(a)==has(b)`) | 10 | 2 | 4 | 0 |
| `grp.all_or_none.3` (`all(x,x) \|\| all(x,!x)`) | 40 | 6 | 18 | 0 |
| `grp.all_or_none.3.alt` (`!(a\|\|b\|\|c) \|\| (a&&b&&c)`) | 40 | 6 | 18 | 0 |
| `…at_least_one.3.minLength1` | 27 | **0** | **0** | 37 |
| `…exactly_one.exists_one.minLength1` | 27 | **0** | **0** | 37 |
| `…all_or_none.2.minLength1` | 9 | **0** | **0** | 7 |
| `…*.nullable` (null allowed) | same as non-nullable | | | |

- **`exists_one` and sum-of-ternaries give identical results on all 64 inputs** (37/12/15 each): same rule as far as validonce is concerned. The two `all_or_none` n-field spellings are identical as well (40/6/18).
- **Every difference has `""` in the data;** with `minLength: 1` on every member the differences go to 0 and the `""` inputs are rejected at step 4.
- **Nullable members change nothing** (`grp.*.nullable` = the non-nullable counts), because `has()` is false for `null`.
- **Mixed member types** (`list`, `integer`, `boolean`): `0`, `false`, `{}` agree (they are present in both); only `[]` differs (`grp.at_least_one.mixed`: 7 agree, 1 strict, `{"a": []}`). With `minItems: 1` it would be rejected.

## Surprises

1. **`null` is not a hazard.** The design assumed nullable fields needed their own guard. They do not: Kubernetes treats an explicit `null` as absent for `has()` whether or not the field is `nullable` (non-nullable nulls are dropped before CEL; nullable nulls make `has()` false). `has()` differs from validonce only on `""` and `[]`.
2. **`self.f` on a missing field is a hard error, not false.** Every unguarded read of an optional field (`self.plan == 'pro'`, `self.a <= self.b`) is a 422 `no such key` against the rule's owning object, not the field, when the operand is absent. validonce passes or skips. This turns most bare `compare` and `eq` rules into `server_only` unless the author wrote `has()` guards or `required`. The `has()`-guarded form is exactly validonce's skip rule, so the translator should accept it as the canonical `compare` shape.
3. **`format: date` / `date-time` strings are CEL timestamps.** `+` with a string fails to compile; `timestamp()` is a no-op. The translator reads `format` from the schema, not just the CEL.
4. **Defaults silently turn "absent" into "present".** The client form sees the raw value; the server applies the default before CEL. Any rule reading a defaulted field is inexact.
5. **Mixed `int == double`, and `number == int-literal`, do not compile**; mixed ordering does. No translator input will contain them.
6. **CEL is skipped on `required` / type errors but not on `minLength` / `format` errors.** A cross-field error and a `minLength` error can come back together in one 422; a missing required field hides all rules (`has.rw.string.required`: `celAlso: skipped`). Relevant to how the translator maps messages.
7. **Sub-millisecond timestamps** are the only place a plain, valid, well-formed input makes the client strict (blocking) where the server accepts. Everything else strict comes from `""`/`[]`/defaults, which have static guards.
8. **`1.0` for an integer field** passes schema validation but breaks CEL at runtime (`expected int, got float64`).

## What the translator should implement (summary)

1. Translate only if every field the rule reads satisfies the row's guard, read from the schema node (`minLength`, `minItems`, `required`, `default`, `format`, `type`, `pattern`). Anything else stays `server_only` with `params.cel`.
2. Accept the `has()`-guarded forms for optional operands: `!has(a) || !has(b) || a <op> b`, `has(p) && p == lit`, `!has(p) || p != lit`.
3. Literal type must match the field's CEL type (`number` ⇒ double literal for `==`).
4. Datetime: require `format: date-time` and a ≤ 3-digit fraction `pattern`, else `server_only`. Date: require `format: date`. Plain strings with `timestamp()`: `server_only`.

## Versions and timing

| Item | Version |
|---|---|
| Go toolchain | go1.27.4 darwin/arm64 (`go 1.27.4` in `go.mod`) |
| `k8s.io/apiextensions-apiserver` | v0.37.2 |
| `k8s.io/apiserver`, `k8s.io/apimachinery`, `k8s.io/api` | v0.37.2 |
| `github.com/google/cel-go` | v0.29.2 (resolved by the k8s modules; indirect) |
| Module path | `github.com/metatoy/validonce/tools/k8s-cel-diff` |

`go run . -json` on all 2,205 inputs: first run with a cold build cache about 5 s wall (compile + link); warm about 0.5 s. The first `go vet` (cold cache) took about 8 s wall. `go get` of the four modules about 5 s. `compare.mjs` over the 2,205 verdicts is instant.
