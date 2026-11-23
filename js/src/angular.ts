// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import type {
  AbstractControl,
  FormGroup,
  ValidationErrors,
  ValidatorFn,
} from "@angular/forms";
import { evaluate } from "./evaluate";
import { formatMessage } from "./messages";
import type { Rule } from "./types";

export interface GroupValidatorOptions {
  /**
   * Message catalog: rule message key -> text. `{name}` placeholders are
   * replaced from the issue params. A key with no entry gets the default text
   * for its rule kind (see `validonce/messages`), as `withRules` does.
   */
  messages?: Record<string, string>;
}

/** The error object set on the control an issue points at. */
export interface ValidonceControlError {
  ruleId: string;
  key: string;
  params: Record<string, unknown>;
  message: string;
}

function withoutValidonce(
  errors: ValidationErrors | null,
): ValidationErrors | null {
  if (errors === null || !("validonce" in errors)) return errors;
  const { validonce: _removed, ...rest } = errors;
  return Object.keys(rest).length === 0 ? null : rest;
}

/**
 * A `ValidatorFn` for a `FormGroup` (Reactive Forms) that evaluates validonce
 * rules (client side: `server_only` rules are skipped) against
 * `group.getRawValue()`.
 *
 * - Each issue sets `{ validonce: { ruleId, key, params, message } }` on the
 *   control at the issue's path (`group.get(path)`); other errors on that
 *   control are kept. When the issue no longer applies, only the `validonce`
 *   error is removed. If one control has several issues, the first wins.
 *   Paths with no control are ignored.
 * - The group's own error is `{ validonce: Issue[] }`, or `null` with no issues.
 * - The rules see the wire form of the value. Dates must be ISO strings
 *   (`YYYY-MM-DD`), which `<input type="date">` produces; an empty input is
 *   `""`, which counts as blank.
 * - For a nested group, put a validator on that group with that object's own
 *   rules; its issues are paths inside that group.
 *
 * Use one validator instance per group (it remembers which controls it marked).
 */
export function validonceGroupValidator(
  rules: readonly Rule[] | { rules: readonly Rule[] },
  options?: GroupValidatorOptions,
): ValidatorFn {
  const list: readonly Rule[] = Array.isArray(rules)
    ? rules
    : (rules as { rules: readonly Rule[] }).rules;
  const marked = new Set<AbstractControl>();
  return (control: AbstractControl): ValidationErrors | null => {
    const group = control as FormGroup;
    if (typeof group.getRawValue !== "function") return null;
    const value: unknown = group.getRawValue();
    if (typeof value !== "object" || value === null || Array.isArray(value))
      return null;
    const issues = evaluate(list, value as Record<string, unknown>, {
      side: "client",
    });
    const now = new Map<AbstractControl, ValidonceControlError>();
    for (const issue of issues) {
      const target = group.get(issue.path);
      if (target === null || target === group || now.has(target)) continue;
      now.set(target, {
        ruleId: issue.ruleId,
        key: issue.key,
        params: issue.params,
        message: formatMessage(issue, options?.messages, list),
      });
    }
    for (const c of marked) {
      if (!now.has(c)) {
        c.setErrors(withoutValidonce(c.errors), { emitEvent: false });
        marked.delete(c);
      }
    }
    for (const [c, err] of now) {
      c.setErrors(
        { ...(c.errors ?? {}), validonce: err },
        { emitEvent: false },
      );
      marked.add(c);
    }
    return issues.length > 0 ? { validonce: issues } : null;
  };
}
