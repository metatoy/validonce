// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { Signup } from "./signup.mjs";

/** Registers POST /signups on an Express app (or router). */
export function mountSignups(app) {
  app.post("/signups", (req, res) => {
    const { error } = Signup.validate(req.body, { abortEarly: false });
    if (error) {
      const errors = error.details.map((d) => ({ field: String(d.path[0] ?? ""), message: d.message }));
      return res.status(422).json({ errors });
    }
    return res.status(200).json({ ok: true });
  });
}
