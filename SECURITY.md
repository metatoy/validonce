# Security policy

## Reporting a vulnerability

Please report security problems privately through GitHub: on this repository, open the **Security** tab and choose **Report a vulnerability**. Do not open a public issue.

Include what is affected (package and version), how to reproduce it, and what an attacker could do. You will get an acknowledgement within 3 working days and an assessment within 10. Fixes are released as a patch version and credited in the changelog unless you prefer otherwise.

## Supported versions

Only the latest minor release of each package gets security fixes: `validonce` on npm and PyPI, and `Validonce`, `Validonce.FluentValidation`, `Validonce.AspNetCore` and `Validonce.Cli` on NuGet.

## Scope

validonce evaluates validation rules; it does not replace server-side validation of your own. The server packages always enforce the rules, and a client that skips them is expected. Reports about the agent migration tools (`mcp/`, `skills/`) are in scope too.
