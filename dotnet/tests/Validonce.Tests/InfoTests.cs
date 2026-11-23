// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

using Validonce;
using Xunit;

namespace Validonce.Tests;

public class InfoTests
{
    [Fact]
    public void FormatVersionIsOne() => Assert.Equal("1", ValidonceInfo.FormatVersion);
}
