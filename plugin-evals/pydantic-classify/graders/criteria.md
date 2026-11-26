---
type: llm
weight: 2
---

PASS if the answer does all three:
1. Drafts the date check as a compare rule where `end` must be greater than or equal to (`ge`) `start`, typed as a date.
2. Drafts the email-or-phone check as an "at least one of" rule over `email` and `phone`.
3. Keeps the subtotal + tax = total check hand-written, because the rule format has no arithmetic.

Caveats do not make an item fail. An answer that drafts a rule and also warns about a behaviour difference (for example how blank or whitespace values are treated) still meets items 1 and 2.

FAIL if any of the three is missing, if the date comparison is strict (`gt`) instead of `ge`, or if the arithmetic check is turned into a rule.
