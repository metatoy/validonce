// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<object, object, unknown>;
  export default component;
}
