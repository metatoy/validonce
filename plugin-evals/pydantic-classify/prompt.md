---
max_turns: 15
timeout_seconds: 400
tags: [classify, pydantic]
allowed_tools: [Read, Glob, Grep, Skill]
---

We want our FastAPI app's cross-field checks to run in the browser too, using validonce. Here is the model. Which of these checks can become validonce rules, and which have to stay hand-written? Draft the rules for the ones that move. Don't run or install anything, just answer here.

```python
from datetime import date
from decimal import Decimal
from pydantic import BaseModel, model_validator

class Booking(BaseModel):
    start: date | None = None
    end: date | None = None
    email: str | None = None
    phone: str | None = None
    subtotal: Decimal
    tax: Decimal
    total: Decimal

    @model_validator(mode="after")
    def check(self):
        if self.start and self.end and self.end < self.start:
            raise ValueError("end must be on or after start")
        if not self.email and not self.phone:
            raise ValueError("give an email or a phone number")
        if self.subtotal + self.tax != self.total:
            raise ValueError("total must equal subtotal plus tax")
        return self
```
