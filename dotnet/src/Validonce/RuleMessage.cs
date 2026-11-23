// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

using System.Text.Json.Nodes;

namespace Validonce;

/// <summary>The message of a rule: a key clients translate, and the values for it.</summary>
/// <param name="Key">The message key.</param>
/// <param name="Params">Values for the message: strings, numbers, booleans or null.</param>
public sealed record RuleMessage(string Key, IReadOnlyDictionary<string, JsonNode?> Params);
