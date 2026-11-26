---
max_turns: 15
timeout_seconds: 400
tags: [classify, frontend, vue]
allowed_tools: [Read, Glob, Grep, Skill]
---

Our Vue 3 form uses VeeValidate with this yup schema, and our API repeats the same checks by hand. We want to define them once on the server with validonce. Which can move and which can't? Draft the rules for the ones that move. Don't run or install anything, just answer here.

```ts
import { toTypedSchema } from "@vee-validate/yup";
import * as yup from "yup";

export const schema = toTypedSchema(
  yup.object({
    accountType: yup.string().oneOf(["personal", "business"]).required(),
    company: yup.string().when("accountType", {
      is: "business",
      then: (s) => s.required("Company is required for business accounts"),
    }),
    street: yup.string(),
    city: yup.string(),
    zip: yup.string(),
    price: yup.number().required(),
    discount: yup.number().test("max-half", "Discount can be at most half the price", function (d) {
      return d === undefined || d <= this.parent.price / 2;
    }),
  }).test("address-together", "Street, city and zip go together", (v) => {
    const filled = [v.street, v.city, v.zip].filter((x) => x).length;
    return filled === 0 || filled === 3;
  }),
);
```
