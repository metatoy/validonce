// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

namespace Validonce;

/// <summary>Thrown when rule data is not valid version-1 rule format.</summary>
public sealed class ValidonceFormatException : Exception
{
    public ValidonceFormatException(string message) : base(message) { }
}
