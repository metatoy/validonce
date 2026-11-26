# go-playground/validator (Go) to validonce

Target: the `validonce` Go package (`github.com/metatoy/validonce/go`): `validonce.MustBuild[T](...)` with the builders `When(...).Require`, `Cmp(...).Ge`, `AtLeastOneOf`, `ExactlyOneOf`, `AllOrNone`, plus the adapter your framework already uses (e.g. `humaonce`) (see `docs/getting-started-go.md`). Your struct tags for field rules (`required`, `email`, `oneof`) keep working beside the cross-field rules. Run the old validator with `scripts/run-go/` (copy it, replace `model.go` with the struct and the struct-level validators). Ground truth: `testbeds/before/go-playground/`.

Wire names: validonce rules use the **JSON names**, i.e. the `json` tag (`json:"postalCode"`), not the Go field names (`PostalCode`) that go-playground's `fe.Field()` returns by default. The runner calls `RegisterTagNameFunc` to read the `json` tag; a validator that reports `sl.ReportError(v, "postalCode", "PostalCode", ...)` already names the wire field.

## Where cross-field checks hide

- **Cross-field tags:** `required_if`, `required_unless`, `required_with`, `required_with_all`, `required_without`, `required_without_all`, `excluded_if`, `eqfield`, `nefield`, `gtfield`, `gtefield`, `ltfield`, `ltefield`, `eqcsfield` and the `cs` (cross-struct) forms.
- **`RegisterStructValidation`:** a function over the whole struct that calls `sl.ReportError(...)`. Read each one: most are one of the five kinds written by hand.
- **`validate.Var` / `validate.VarWithValue`** calls in handlers, and `Validate() error` methods on request types.

## Before to after, per kind

### required_if / required_unless -> required_when

```go
// before
Company string `json:"company" validate:"required_if=Plan pro"`
```
```go
// after (the tag goes; the rule is validonce's)
validonce.When(validonce.Eq("plan", "pro")).Require("company", validonce.Key("rules.company_required"))
```
`required_unless=Plan free` is `validonce.Ne("plan", "free")` as the condition. `required_if=A x B y` (several pairs) means **all** pairs must match: `validonce.AllOf(Eq(..), Eq(..))`.

### required_with / required_without -> at_least_one_of, all_or_none

`required_without=Phone` on `Email` (and the mirror on `Phone`) is `at_least_one_of(email, phone)`:

```go
// before
Email string `json:"email" validate:"required_without=Phone"`
// after
validonce.AtLeastOneOf([]string{"email", "phone"}, validonce.Key("rules.contact_email_or_phone"))
```
`required_with=B` on `A` plus `required_with=A` on `B` is `all_or_none(a, b)`. A single `required_with=B` is one-directional ("if B is set, A is required"): that is `required_when` with condition `Present("b")`, not `all_or_none`. `required_without_all=A B` on `C` is `at_least_one_of(a, b, c)`. An exactly-one check (`Must` struct-level with `^`, or `required_without` combined with `excluded_with`) is `exactly_one_of`.

### gtefield / ltefield -> compare

```go
// before
End *time.Time `json:"end" validate:"omitempty,gtefield=Start"`
// after
validonce.Cmp("end").Ge(validonce.Ref("start"), validonce.Key("rules.end_after_start"))
```
`gtefield` is `Ge`, `gtfield` is `Gt`, `ltefield` `Le`, `ltfield` `Lt`, `eqfield` `Eq`, `nefield` `Ne`. For a constant (`gte=1`) use `validonce.Cmp("quantity").Ge(validonce.Val(1))` (field-level `gte`/`min` tags are not cross-field: leave them).

### RegisterStructValidation

```go
// before
func(sl validator.StructLevel) {
    c := sl.Current().Interface().(Contact)
    n := 0
    for _, s := range []string{c.Street, c.City, c.PostalCode} { if s != "" { n++ } }
    if n != 0 && n != 3 { sl.ReportError(c.Street, "street", "Street", "all_or_none", "") }
}
```
becomes `validonce.AllOrNone([]string{"street", "city", "postalCode"}, ...)`. Anything that calls a database, a clock, a regex over several fields or loops over a slice stays hand-written (see below).

## Traps

- **Blank means null, missing, `""` or `[]`.** With value fields (`string`), `null`, a missing key and `""` all decode to `""`; go-playground's `required*` treat the zero value as absent. With pointer fields (`*string`), `required_if` sees a non-nil pointer to `""` as **present** (it passes), but validonce treats `""` as blank: the differential check shows this at the blank row. `" "` is **not** blank in validonce; if the old code uses `strings.TrimSpace`, keep that rule hand-written.
- **`gtefield` on strings compares length**, not text (go-playground compares `len` for strings), and on `time.Time` compares instants. Dates as `YYYY-MM-DD` strings with `gtefield` are therefore a bug in the old code that validonce does not reproduce. If the old behaviour must be kept, leave the rule hand-written; otherwise say so in the report.
- **`omitempty` on the tag** skips every validator after it when the value is zero, so `omitempty,gtefield=Start` passes when `End` is empty: that is validonce's compare (a blank side passes). Without `omitempty`, a zero `time.Time` is compared as year 1 and fails `gtefield`.
- **Numbers:** validonce compares IEEE doubles. `int64` values beyond 2^53 or `decimal` types differ; keep those hand-written.
- **`required_if` argument syntax** is `Field value` with the **Go field name**, not the JSON name: translate the field name to its `json` tag when writing the rule.
- **Unknown tag order and `dive`:** rules inside `dive` (slices, maps) and nested structs are nested checks: keep hand-written.
- **Error path:** the old validator may report a different field than validonce's default path (the first field, or the compared one). A different path is a warning, not a divergence; set `Path(...)` in the rule to match the old field.

## What stays hand-written

Field-level tags (`required`, `email`, `url`, `oneof`, `min`, `max`, `len`, `uuid`: express them in the OpenAPI schema if you use huma, or leave them), custom `RegisterValidation` functions on one field, anything that needs I/O or a context (uniqueness, existence), checks over slices or maps, and comparisons of values that are not numbers, strings or dates. Say each one in the report with the reason.
