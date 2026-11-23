// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

namespace Validonce.AspNetCore;

public sealed class ValidonceOptions
{
    /// <summary>
    /// Status of a validation-failure response. Default 422: the body parsed, but its content breaks the rules
    /// (FastAPI answers 422 too, so one client handles both backends). Set 400 to match ASP.NET's built-in validation.
    /// </summary>
    public int ValidationStatusCode { get; set; } = StatusCodes.Status422UnprocessableEntity;
}
