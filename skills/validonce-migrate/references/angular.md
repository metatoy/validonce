# Angular Reactive Forms to validonce

Server rules live in C# or Python. The `FormGroup` gets `validonceGroupValidator(rules, { messages })` from `validonce/angular`. Signal Forms take the Zod schema (`withRules`) through `validateStandardSchema`. Run the old validator with `scripts/run-js.mjs --kind angular`; export a **factory** that returns a fresh `FormGroup` with all controls and the group validator. Ground truth: `testbeds/before/angular/signup.mjs`.

## Before to after, per kind

```ts
// before: group validator that sets errors on controls
function signupRules(group: AbstractControl) {
  const v = group.value;
  const setErr = (name: string, key: string) => {
    const c = group.get(name)!;
    c.setErrors({ ...(c.errors ?? {}), [key]: true });
  };
  if (v.plan === "pro" && !v.company) setErr("company", "required");        // required_when
  if (v.end && v.end < v.start) setErr("end", "endBeforeStart");           // compare (date)
  if (v.quantity < 1) setErr("quantity", "min");                           // compare (number, constant)
  return null;
}
new FormGroup({ ... }, { validators: signupRules });
```
```ts
// after
import { validonceGroupValidator } from "validonce/angular";
new FormGroup({ ... }, { validators: validonceGroupValidator(rules, { messages }) });
// group.controls.company.errors -> { validonce: { ruleId, key, params, message } }
```

The rules (`required_when` company when plan is pro; `compare` end `ge` start as `date`; `compare` quantity `ge` 1 as `number`) are the same JSON as in `zod.md`.

Cross-field **control-level** validators (`ValidatorFn` on one control reading `control.parent`) are the same logic: classify by what they compare. Template-level `*ngIf` display logic is not validation.

## Traps

- **Raw value vs value.** `group.value` omits **disabled** controls; `validonceGroupValidator` runs on `getRawValue()`. A disabled control is blank in `value` but filled in `getRawValue()`. Decide which the old code meant; if it used `value` on a group with disabled controls, the check may differ.
- **Empty input is `""`.** `<input>` gives `""`, not `null`: blank in validonce too. A `FormControl(null)` and `""` both blank. But `" "` is not blank; `Validators.required` also rejects only `""`/`null`/`[]`, which matches, while `Validators.pattern` etc. are field-level.
- **Dates must be ISO strings** (`YYYY-MM-DD`), which `<input type="date">` gives. A `Date` object or `NgbDate` model is not a wire value; compare the string form or keep hand-written.
- **`v.quantity < 1` on `""`**: JavaScript coerces `""` to `0`, so `"" < 1` is **true** and the old code errors on an empty quantity; validonce `compare` passes (blank). Keep requiredness as a separate rule (`Validators.required`) and expect the divergence the check will show.
- **Number inputs**: `<input type="number">` binds numbers (or `null`); `type="text"` binds strings, and `"10" < "9"` is a string comparison. Strings vs numbers is a coercing comparison: not migrated.
- **Error shape.** Old code sets keys like `{ required: true }`; templates showing `errors?.required` must switch to `errors?.validonce` (and read `message`). Update templates when removing the old validator.
- **Existing errors are kept.** The new validator removes only its own `validonce` error from a control; it does not clear `required` from `Validators.required`.
- **One validator instance per group**; nested groups get their own validator with that object's rules.
- **Async validators** (`AsyncValidatorFn`) never map.
