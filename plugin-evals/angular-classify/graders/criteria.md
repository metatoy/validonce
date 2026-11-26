---
type: llm
weight: 2
---

PASS if the answer does all three:
1. Drafts `contactRequired` as an "at least one of" rule over `email` and `phone`.
2. Drafts `onePaymentMethod` as an "exactly one of" rule over `cardNumber` and `invoiceRef`.
3. Keeps `couponValid` hand-written, because it calls an API.

Caveats do not make an item fail. An answer that drafts a rule and also warns about a behaviour difference (for example how whitespace-only values count) still meets the item.

FAIL if any of the three is missing, if `onePaymentMethod` is drafted as "at least one of", or if the coupon check is turned into a rule.
