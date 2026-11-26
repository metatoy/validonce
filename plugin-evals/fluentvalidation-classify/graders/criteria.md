---
type: llm
weight: 2
---

PASS if the answer does all three:
1. Drafts the Company rule as a "required when" rule: `company` is required when `plan` equals "pro".
2. Drafts the seats rule as a compare rule where `maxSeats` must be strictly greater than (`gt`, not `ge`) `minSeats`.
3. Keeps the email uniqueness check hand-written on the server, because it needs a database lookup.

Caveats do not make an item fail. An answer that drafts a rule and also warns about a behaviour difference (for example that `NotEmpty` treats whitespace as empty, or that nullable seat fields need separate required checks) and suggests keeping the old check alongside still meets items 1 and 2.

FAIL if any of the three is missing, if the seats comparison is `ge`, or if the uniqueness check is turned into a rule.
