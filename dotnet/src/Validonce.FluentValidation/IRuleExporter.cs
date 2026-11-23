// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

namespace Validonce.FluentValidation;

/// <summary>Anything that can export its cross-field rules as rule-format data.</summary>
public interface IRuleExporter
{
    /// <summary>The validated model type.</summary>
    Type ModelType { get; }

    /// <summary>The rule-format data (version 1).</summary>
    RuleSet ExportRules();
}
