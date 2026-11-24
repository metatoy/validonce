// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { parseRuleSet } from "./parse";
import type {
  CompareOp,
  CompareType,
  Condition,
  Rule,
  RuleSet,
  Scalar,
} from "./types";

/** Raised at startup when rules cannot be exported (unknown field, id collision, bad type…). */
export class ValidonceDefinitionError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "ValidonceDefinitionError";
  }
}

type Params = Record<string, string | number | boolean | null>;

export interface RuleOptions {
  /** Message key (required). */
  key: string;
  params?: Params;
  /** Rule id; defaults to `Schema.kind.path`. */
  id?: string;
  server_only?: boolean;
  path?: string | FieldRef;
}

export interface CompareOptions extends RuleOptions {
  /** Compare type; needed unless the field map given to `defineRules` names it. */
  type?: CompareType;
}

/** Rule drafts: what the builders return, resolved by `defineRules`. */
export type RuleDraft = {
  kind: Rule["kind"];
  field?: string;
  when?: Condition;
  left?: string;
  op?: CompareOp;
  right?: { field: string } | { value: string | number };
  type?: CompareType;
  fields?: string[];
  opts: RuleOptions;
};

const DRAFT = Symbol("validonce.draft");
type Draft = RuleDraft & { [DRAFT]: true };

function draft(d: RuleDraft): Draft {
  return Object.assign(d, { [DRAFT]: true as const });
}

function nameOf(f: FieldRef | string): string {
  if (f instanceof FieldRef) return f.name;
  if (typeof f === "string" && f !== "") return f;
  throw new ValidonceDefinitionError(
    `expected a field reference (F.name), got ${String(f)}`,
  );
}

function scalar(v: unknown, where: string): Scalar {
  if (
    typeof v === "string" ||
    typeof v === "boolean" ||
    (typeof v === "number" && Number.isFinite(v))
  )
    return v;
  throw new ValidonceDefinitionError(
    `${where}: value must be a string, number or boolean`,
  );
}

/** A reference to a field by its wire name (`F.plan`, `F["plan"]`). */
export class FieldRef {
  constructor(readonly name: string) {}

  eq(value: Scalar): Condition {
    return {
      eq: { field: this.name, value: scalar(value, `F.${this.name}.eq`) },
    };
  }
  ne(value: Scalar): Condition {
    return {
      ne: { field: this.name, value: scalar(value, `F.${this.name}.ne`) },
    };
  }
  isIn(values: Scalar[]): Condition {
    if (values.length === 0)
      throw new ValidonceDefinitionError(
        `F.${this.name}.isIn needs at least one value`,
      );
    return {
      in: {
        field: this.name,
        values: values.map((v) => scalar(v, `F.${this.name}.isIn`)),
      },
    };
  }
  present(): Condition {
    return { present: { field: this.name } };
  }
  absent(): Condition {
    return { absent: { field: this.name } };
  }

  private cmp(
    op: CompareOp,
    other: FieldRef | string | number,
    o: CompareOptions,
  ): RuleDraft {
    const right =
      other instanceof FieldRef
        ? { field: other.name }
        : { value: scalar(other, `F.${this.name}.${op}`) as string | number };
    if (
      typeof right === "object" &&
      "value" in right &&
      typeof right.value === "boolean"
    )
      throw new ValidonceDefinitionError(
        `F.${this.name}.${op}: compare constants are strings or numbers`,
      );
    return draft({
      kind: "compare",
      left: this.name,
      op,
      right,
      type: o.type,
      opts: o,
    });
  }
  lt(other: FieldRef | string | number, o: CompareOptions): RuleDraft {
    return this.cmp("lt", other, o);
  }
  le(other: FieldRef | string | number, o: CompareOptions): RuleDraft {
    return this.cmp("le", other, o);
  }
  gt(other: FieldRef | string | number, o: CompareOptions): RuleDraft {
    return this.cmp("gt", other, o);
  }
  ge(other: FieldRef | string | number, o: CompareOptions): RuleDraft {
    return this.cmp("ge", other, o);
  }
  /** Compare rule with op `eq` (named `equals` so it does not clash with the condition `eq`). */
  equals(other: FieldRef | string | number, o: CompareOptions): RuleDraft {
    return this.cmp("eq", other, o);
  }
  notEquals(other: FieldRef | string | number, o: CompareOptions): RuleDraft {
    return this.cmp("ne", other, o);
  }
}

/** `F.plan` or `F("plan")` both give a field reference. */
export const F: ((name: string) => FieldRef) & Record<string, FieldRef> =
  new Proxy(((name: string) => new FieldRef(name)) as never, {
    get(_t, prop) {
      if (typeof prop !== "string") return undefined;
      return new FieldRef(prop);
    },
    apply(_t, _this, args: [string]) {
      return new FieldRef(args[0]);
    },
  });

/**
 * Typed field references: `const { plan, company } = fieldRefs("plan", "company")`. Unlike `F`,
 * a typo is a compile error, and the result is not `| undefined` under `noUncheckedIndexedAccess`.
 */
export function fieldRefs<const N extends string>(
  ...names: readonly N[]
): Record<N, FieldRef> {
  const out = {} as Record<N, FieldRef>;
  for (const n of names) out[n] = new FieldRef(n);
  return out;
}

export function allOf(...conditions: Condition[]): Condition {
  if (conditions.length === 0)
    throw new ValidonceDefinitionError("allOf needs at least one condition");
  return { all: conditions };
}
export function anyOf(...conditions: Condition[]): Condition {
  if (conditions.length === 0)
    throw new ValidonceDefinitionError("anyOf needs at least one condition");
  return { any: conditions };
}
export function not(condition: Condition): Condition {
  return { not: condition };
}

export function when(condition: Condition): {
  require: (field: FieldRef | string, o: RuleOptions) => RuleDraft;
} {
  return {
    require: (field, o) =>
      draft({
        kind: "required_when",
        field: nameOf(field),
        when: condition,
        opts: o,
      }),
  };
}

function group(
  kind: FieldsKind,
  fields: (FieldRef | string)[],
  o: RuleOptions,
) {
  return draft({ kind, fields: fields.map(nameOf), opts: o });
}
type FieldsKind = "at_least_one_of" | "exactly_one_of" | "all_or_none";

/** Fails when every listed field is blank. Last argument is the options object. */
export function atLeastOneOf(
  ...args: [...(FieldRef | string)[], RuleOptions]
): RuleDraft {
  const o = args.pop() as RuleOptions;
  return group("at_least_one_of", args as (FieldRef | string)[], o);
}
/** Fails unless exactly one listed field is non-blank. */
export function exactlyOneOf(
  ...args: [...(FieldRef | string)[], RuleOptions]
): RuleDraft {
  const o = args.pop() as RuleOptions;
  return group("exactly_one_of", args as (FieldRef | string)[], o);
}
/** Fails when some, but not all, listed fields are blank. */
export function allOrNone(
  ...args: [...(FieldRef | string)[], RuleOptions]
): RuleDraft {
  const o = args.pop() as RuleOptions;
  return group("all_or_none", args as (FieldRef | string)[], o);
}

export interface DefineRulesOptions {
  /**
   * The schema's wire field names, either a list or a map from name to compare type
   * (`undefined` when a field has no comparable type). With it, unknown fields fail at
   * startup, and `compare` rules need no `type` when the map names one.
   */
  fields?:
    | readonly string[]
    | Readonly<Record<string, CompareType | undefined>>;
}

const TYPES: readonly string[] = ["number", "string", "date", "datetime"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Turns builder output into a rule-format v1 `RuleSet`. Throws `ValidonceDefinitionError` for an
 * unknown field (when `fields` is given), a duplicate id, an unsupported compare type or a
 * malformed rule; call it at module load so a bad definition stops the app at startup.
 */
export function defineRules(
  schemaName: string,
  drafts: readonly RuleDraft[],
  options: DefineRulesOptions = {},
): RuleSet {
  const f = options.fields;
  const types: Record<string, string | undefined> = Object.create(null);
  let known: Set<string> | undefined;
  if (Array.isArray(f)) known = new Set(f as string[]);
  else if (f) {
    known = new Set(Object.keys(f));
    for (const [k, v] of Object.entries(f)) types[k] = v;
  }
  const label = (i: number) => `${schemaName}: rule #${i + 1}`;
  const check = (name: string, where: string): string => {
    if (known && !known.has(name))
      throw new ValidonceDefinitionError(
        `${where} refers to unknown field "${name}" (fields: ${[...known].sort().join(", ")})`,
      );
    return name;
  };
  const cond = (c: Condition, where: string): Condition => {
    if (
      "eq" in c ||
      "ne" in c ||
      "in" in c ||
      "present" in c ||
      "absent" in c
    ) {
      const body = Object.values(c)[0] as { field: string };
      check(body.field, where);
      return c;
    }
    if ("all" in c) for (const x of c.all) cond(x, where);
    else if ("any" in c) for (const x of c.any) cond(x, where);
    else cond(c.not, where);
    return c;
  };

  const seen = new Set<string>();
  const rules: Rule[] = drafts.map((d, i) => {
    const where = label(i);
    if (!d || !(DRAFT in d))
      throw new ValidonceDefinitionError(
        `${where} was not built with the builders`,
      );
    const o = d.opts;
    if (!o || typeof o.key !== "string" || o.key === "")
      throw new ValidonceDefinitionError(`${where}: message key is required`);
    for (const [k, v] of Object.entries(o.params ?? {}))
      if (!(v === null || ["string", "number", "boolean"].includes(typeof v)))
        throw new ValidonceDefinitionError(
          `${where}: param "${k}" must be a string, number, boolean or null`,
        );

    let rule: Rule;
    let defaultPath: string;
    const common = {
      message: { key: o.key, ...(o.params ? { params: { ...o.params } } : {}) },
    };
    if (d.kind === "required_when") {
      const field = check(d.field as string, where);
      defaultPath = field;
      rule = {
        id: "",
        kind: "required_when",
        field,
        when: cond(d.when as Condition, where),
        ...common,
      };
    } else if (d.kind === "compare") {
      const left = check(d.left as string, where);
      defaultPath = left;
      const right = d.right as { field: string } | { value: string | number };
      if ("field" in right) check(right.field, where);
      const type = (d.type ?? types[left]) as CompareType | undefined;
      if (type === undefined)
        throw new ValidonceDefinitionError(
          `${where}: cannot tell the compare type of "${left}"; pass type: "number" | "string" | "date" | "datetime"`,
        );
      if (!TYPES.includes(type))
        throw new ValidonceDefinitionError(
          `${where}: unsupported compare type ${JSON.stringify(type)}`,
        );
      if ("field" in right) {
        const other = types[right.field];
        if (!d.type && other !== undefined && other !== type)
          throw new ValidonceDefinitionError(
            `${where}: cannot compare "${left}" (${type}) with "${right.field}" (${other})`,
          );
      } else if (
        (type === "number") !== (typeof right.value === "number") ||
        ((type === "date" || type === "datetime") &&
          (typeof right.value !== "string" ||
            (type === "date" && !ISO_DATE.test(right.value))))
      )
        throw new ValidonceDefinitionError(
          `${where}: value ${JSON.stringify(right.value)} does not match compare type ${type}`,
        );
      rule = {
        id: "",
        kind: "compare",
        left: { field: left },
        op: d.op as CompareOp,
        right,
        type,
        ...common,
      };
    } else {
      const fields = d.fields ?? [];
      if (fields.length < 2)
        throw new ValidonceDefinitionError(
          `${where}: ${d.kind} needs at least two fields`,
        );
      if (new Set(fields).size !== fields.length)
        throw new ValidonceDefinitionError(
          `${where}: ${d.kind} lists a field twice`,
        );
      for (const x of fields) check(x, where);
      defaultPath = fields[0] as string;
      rule = {
        id: "",
        kind: d.kind as FieldsKind,
        fields: [...fields],
        ...common,
      };
    }
    if (o.path !== undefined) {
      rule.path = check(nameOf(o.path), where);
      defaultPath = rule.path;
    }
    if (o.server_only) rule.server_only = true;
    rule.id = o.id ?? `${schemaName}.${d.kind}.${defaultPath}`;
    if (seen.has(rule.id))
      throw new ValidonceDefinitionError(
        `${where}: duplicate rule id "${rule.id}"; pass id: to tell them apart`,
      );
    seen.add(rule.id);
    return rule;
  });

  const set: RuleSet = { version: 1, rules };
  return parseRuleSet(JSON.parse(JSON.stringify(set)));
}
