// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace Validonce;

/// <summary>Pinned-behavior helpers shared by the evaluators.</summary>
internal static class Values
{
    public static JsonNode? Get(JsonObject data, string field) =>
        data.TryGetPropertyValue(field, out var n) ? n : null;

    public static bool IsBlank(JsonNode? n)
    {
        if (n is null) return true;
        switch (n.GetValueKind())
        {
            case JsonValueKind.Null: return true;
            case JsonValueKind.String: return n.GetValue<string>().Length == 0;
            case JsonValueKind.Array: return n.AsArray().Count == 0;
            default: return false;
        }
    }

    public static double Num(JsonNode n) =>
        double.Parse(n.ToJsonString(), NumberStyles.Float, CultureInfo.InvariantCulture);

    public static bool IsNumber(JsonNode? n) => n is not null && n.GetValueKind() == JsonValueKind.Number;
    public static bool IsString(JsonNode? n) => n is not null && n.GetValueKind() == JsonValueKind.String;

    public static bool StrictEquals(JsonNode? a, JsonNode? b)
    {
        if (a is null || b is null) return false;
        var ka = a.GetValueKind();
        if (ka != b.GetValueKind()) return false;
        return ka switch
        {
            JsonValueKind.Number => Values.Num(a) == Values.Num(b),
            JsonValueKind.String => string.Equals(a.GetValue<string>(), b.GetValue<string>(), StringComparison.Ordinal),
            JsonValueKind.True or JsonValueKind.False => true,
            _ => false,
        };
    }

    public static int CompareCodePoints(string a, string b)
    {
        var ea = a.EnumerateRunes().GetEnumerator();
        var eb = b.EnumerateRunes().GetEnumerator();
        while (true)
        {
            var ha = ea.MoveNext();
            var hb = eb.MoveNext();
            if (!ha && !hb) return 0;
            if (!ha) return -1;
            if (!hb) return 1;
            var c = ea.Current.Value.CompareTo(eb.Current.Value);
            if (c != 0) return c < 0 ? -1 : 1;
        }
    }

    private static readonly Regex DateRe = new(@"^([0-9]{4})-([0-9]{2})-([0-9]{2})\z", RegexOptions.CultureInvariant);
    private static readonly Regex DateTimeRe = new(
        @"^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.([0-9]+))?(?:Z|([+-])([0-9]{2}):([0-9]{2}))\z",
        RegexOptions.CultureInvariant);

    private static bool RealDate(int y, int m, int d) =>
        y is >= 1 and <= 9999 && m is >= 1 and <= 12 && d >= 1 && d <= DateTime.DaysInMonth(y, m);

    private static int I(Group g) => int.Parse(g.Value, CultureInfo.InvariantCulture);

    /// <summary>Sortable key for a date string, or null if it fails the type check.</summary>
    public static long? ParseDate(string s)
    {
        var m = DateRe.Match(s);
        if (!m.Success) return null;
        int y = I(m.Groups[1]), mo = I(m.Groups[2]), d = I(m.Groups[3]);
        if (!RealDate(y, mo, d)) return null;
        return (long)y * 10000 + mo * 100 + d;
    }

    /// <summary>Instant in milliseconds, or null if it fails the type check.</summary>
    public static long? ParseDateTime(string s)
    {
        var m = DateTimeRe.Match(s);
        if (!m.Success) return null;
        int y = I(m.Groups[1]), mo = I(m.Groups[2]), d = I(m.Groups[3]);
        int h = I(m.Groups[4]), mi = I(m.Groups[5]), se = I(m.Groups[6]);
        if (!RealDate(y, mo, d) || h > 23 || mi > 59 || se > 59) return null;
        long ms = 0;
        if (m.Groups[7].Success)
            ms = int.Parse(m.Groups[7].Value.PadRight(3, '0').Substring(0, 3), CultureInfo.InvariantCulture);
        long offset = 0;
        if (m.Groups[8].Success)
        {
            int oh = I(m.Groups[9]), om = I(m.Groups[10]);
            if (oh > 23 || om > 59) return null;
            offset = (oh * 60L + om) * 60000L;
            if (m.Groups[8].Value == "-") offset = -offset;
        }
        long dayMs = new DateTime(y, mo, d).Ticks / TimeSpan.TicksPerMillisecond;
        return dayMs + ((h * 60L + mi) * 60 + se) * 1000L + ms - offset;
    }
}
