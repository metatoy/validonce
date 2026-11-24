// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import {
  type ArgumentMetadata,
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  Injectable,
  type PipeTransform,
  UnprocessableEntityException,
} from "@nestjs/common";
import { evaluate } from "./evaluate";
import { parseRuleSet } from "./parse";
import {
  PROBLEM_CONTENT_TYPE,
  type ProblemDetails,
  problemDetails,
} from "./problem";
import type { Issue, RuleSet } from "./types";

export { type ProblemDetails, problemDetails } from "./problem";

const KEY = Symbol.for("validonce.rules");

type Ctor = abstract new (...args: never[]) => unknown;

/** Class decorator carrying the rules: `@ValidonceRules(signupRules) class SignupDto {…}`. */
export function ValidonceRules(rules: RuleSet): ClassDecorator {
  const set = parseRuleSet(rules);
  return (target) => {
    Object.defineProperty(target, KEY, { value: set, configurable: true });
  };
}

/** The rules a class carries (own or inherited), or undefined. */
export function rulesOf(target: unknown): RuleSet | undefined {
  if (typeof target !== "function") return undefined;
  return (target as unknown as Record<symbol, RuleSet | undefined>)[KEY];
}

/** Thrown by the pipe: a 422 whose response body is the problem details. */
export class ValidonceException extends UnprocessableEntityException {
  constructor(readonly issues: Issue[]) {
    super(problemDetails(issues));
  }
}

/**
 * Evaluates the rules on a `@Body()` whose class has `@ValidonceRules` and throws a 422 listing
 * every failing rule. Other arguments pass through. Run it after your field validation
 * (e.g. Nest's `ValidationPipe`), as rules assume well-typed fields.
 */
@Injectable()
export class ValidonceValidationPipe implements PipeTransform {
  /**
   * @param target The body class. Optional when `emitDecoratorMetadata` is on (tsc, SWC), where
   *   Nest reads the class from the parameter type; required with esbuild/Vite, which emit none:
   *   `@Body(new ValidonceValidationPipe(Signup)) body: Signup`.
   */
  constructor(private readonly target?: Ctor) {}

  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (metadata.type !== "body") return value;
    const set = rulesOf(this.target ?? metadata.metatype);
    if (!set) return value;
    if (typeof value !== "object" || value === null || Array.isArray(value))
      return value;
    const issues = evaluate(set.rules, value as Record<string, unknown>);
    if (issues.length > 0) throw new ValidonceException(issues);
    return value;
  }
}

/** Optional: sends the 422 as `application/problem+json` (default Nest replies `application/json`). */
@Catch(ValidonceException)
export class ValidonceExceptionFilter implements ExceptionFilter {
  catch(exception: ValidonceException, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<{
      status(code: number): { type(t: string): { send(body: unknown): void } };
    }>();
    const body: ProblemDetails = problemDetails(exception.issues);
    res.status(422).type(PROBLEM_CONTENT_TYPE).send(body);
  }
}

interface OpenApiDocument {
  components?: { schemas?: Record<string, Record<string, unknown>> };
}

/**
 * `@nestjs/swagger` document post-processor: adds `x-validonce` to each class's component schema.
 * Call it on the result of `SwaggerModule.createDocument`. Throws at startup when a class has no
 * rules or no schema in the document.
 */
export function addValidonceToDocument<D extends object>(
  document: D,
  classes: readonly Ctor[],
): D {
  const schemas = (document as OpenApiDocument).components?.schemas;
  for (const cls of classes) {
    const set = rulesOf(cls);
    if (!set) throw new Error(`${cls.name} has no @ValidonceRules`);
    const schema = schemas?.[cls.name];
    if (!schema)
      throw new Error(
        `${cls.name} has no schema in the OpenAPI document (is it used in a route and decorated with @ApiProperty?)`,
      );
    schema["x-validonce"] = set;
  }
  return document;
}
