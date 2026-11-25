// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { buildApp } from "./app";

const { app } = await buildApp();
await app.listen(Number(process.env.PORT ?? 8030), process.env.HOST ?? "127.0.0.1");
