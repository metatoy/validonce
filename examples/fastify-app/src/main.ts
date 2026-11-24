// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

import { buildApp } from "./app";

const app = await buildApp();
await app.listen({ port: Number(process.env.PORT ?? 8020), host: "127.0.0.1" });
