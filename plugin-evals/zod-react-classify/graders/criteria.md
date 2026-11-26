---
type: llm
weight: 2
---

PASS if the answer does all three:
1. Drafts the end/start check as a compare rule where `endDate` must be greater than or equal to (`ge`) `startDate`, typed as a date.
2. Treats the password confirmation as a compare rule with `eq` between `confirmPassword` and `password`, or explains a specific reason it keeps it (for example that the API doesn't receive `confirmPassword`). Either is acceptable.
3. Keeps the US age check hand-written, because a condition in the rule format can only make a field required, not gate a comparison or a minimum.

Caveats do not make an item fail. An answer that drafts a rule and also warns about a behaviour difference (for example blank values, or that `compare` passes when a side is blank) still meets the item.

FAIL if the end/start check is missing or strict (`gt`), or if the US age check is turned into a single validonce rule that applies only when `country` is "US".
