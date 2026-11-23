# Contributing

Thanks for helping. A few things make reviews quick.

## The rule format is the contract

`docs/rule-format-v1.md` defines what every rule means, and `conformance/rules/` holds the cases that prove it. If you change behavior, change both, and make sure the C#, TypeScript and Python implementations all pass.

## Running the checks

```sh
# .NET
cd dotnet && dotnet test -c Release
# TypeScript (from the repo root first)
pnpm install && cd js && pnpm build && pnpm typecheck && pnpm test && pnpm lint
# Python
cd python && uv run pytest -q && uv run ruff check . && uv run ruff format --check .
```

## Copyright

validonce is Copyright 2026 Metatoy LLC and is licensed under the Apache License, Version 2.0. By contributing, you agree your contribution is licensed under the same terms (Apache-2.0 §5).

## Sign-off

Contributions use the Developer Certificate of Origin (https://developercertificate.org). Add a sign-off line to each commit (`git commit -s`), certifying you wrote the change or have the right to submit it under the Apache License, Version 2.0.

## Test cases

Write test cases and examples yourself. Please do not copy them from other projects' test suites.
