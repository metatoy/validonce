// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

using System.Text.Json.Nodes;

namespace Validonce;

public sealed record RuleMessage(string Key, IReadOnlyDictionary<string, JsonNode?> Params);
