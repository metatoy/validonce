---
type: llm
weight: 2
---

PASS if the answer does all three:
1. Drafts the company check as a "required when" rule: `company` is required when `accountType` equals "business".
2. Drafts the address check as an "all or none" rule over `street`, `city` and `zip`.
3. Keeps the discount check hand-written, because it compares against half the price and the rule format has no arithmetic.

Caveats do not make an item fail. An answer that drafts a rule and also warns about a behaviour difference (for example that yup's `required` or a falsy filter treats some values differently from validonce's blank) still meets the item.

FAIL if any of the three is missing, or if the discount check is turned into a rule.
