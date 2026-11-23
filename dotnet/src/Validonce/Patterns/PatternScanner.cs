// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Metatoy LLC

namespace Validonce.Patterns;

internal sealed class Hit
{
    public required string Id { get; init; }
    public required int Start { get; init; }
    public required int Length { get; init; }
    public string? Rewrite { get; set; }
}

internal sealed class ParseFailure : Exception
{
    public int Position { get; }
    public ParseFailure(int position) : base("parse failure") { Position = position; }
}

/// <summary>Hand-written tokenizer for a superset of the JS, Python, Rust and .NET regex dialects.</summary>
internal sealed class PatternScanner
{
    private const string SyntaxChars = "^$\\.*+?()[]{}|/";

    private readonly string p;
    private readonly int n;
    private readonly List<Hit> hits = new();
    private readonly List<Hit> openerHits = new();
    private readonly Stack<int> groups = new();
    private bool can; // previous token can take a quantifier
    private bool hasNameRef;

    private PatternScanner(string pattern) { p = pattern; n = pattern.Length; }

    internal static List<Hit> Scan(string pattern, out int? failAt)
    {
        var s = new PatternScanner(pattern);
        failAt = null;
        try { s.Top(); }
        catch (ParseFailure f) { failAt = f.Position; }
        catch (Exception) { failAt = 0; }
        if (s.hasNameRef) foreach (var h in s.openerHits) h.Rewrite = null;
        return s.hits;
    }

    private static ParseFailure Fail(int pos) => new(pos);

    private void Add(string id, int start, int len, string? rewrite = null)
        => hits.Add(new Hit { Id = id, Start = start, Length = len, Rewrite = rewrite });

    private static string? TableRewrite(string id) => FindingTable.ById[id].Rewrite;

    private static string? ClassForm(string id, bool inClass)
    {
        var r = TableRewrite(id);
        if (r is null || !inClass) return r;
        return r.Length > 2 && r[0] == '[' && r[^1] == ']' ? r[1..^1] : null;
    }

    private void Top()
    {
        int i = 0;
        while (i < n)
        {
            char c = p[i];
            switch (c)
            {
                case '\\':
                    i = Escape(i, false, out bool q, out _);
                    can = q;
                    break;
                case '(':
                    i = Group(i);
                    break;
                case ')':
                    if (groups.Count == 0) throw Fail(i);
                    groups.Pop();
                    i++;
                    can = true;
                    break;
                case '[':
                    i = Class(i, false);
                    can = true;
                    break;
                case ']':
                    Add("VR025", i, 1, "\\]");
                    i++;
                    can = true;
                    break;
                case '*':
                case '+':
                case '?':
                    if (!can) throw Fail(i);
                    i = AfterQuantifier(i + 1);
                    can = false;
                    break;
                case '{':
                    if (TryBrace(i, out int end, out bool noMin))
                    {
                        if (!can) throw Fail(i);
                        if (noMin) Add("VR018", i, end - i, "{0" + p.Substring(i + 1, end - i - 1));
                        i = AfterQuantifier(end);
                        can = false;
                    }
                    else
                    {
                        Add("VR025", i, 1, "\\{");
                        i++;
                        can = true;
                    }
                    break;
                case '.':
                    Add("VR014", i, 1, null); // no portable rewrite: [^\n\r] still differs on astral characters (VR015)
                    Add("VR015", i, 1);
                    i++;
                    can = true;
                    break;
                case '^':
                    i++;
                    can = false;
                    break;
                case '$':
                    Add("VR005", i, 1);
                    i++;
                    can = false;
                    break;
                case '|':
                    i++;
                    can = false;
                    break;
                default:
                    i += char.IsHighSurrogate(c) && i + 1 < n ? 2 : 1;
                    can = true;
                    break;
            }
        }
        if (groups.Count > 0) throw Fail(groups.Peek());
    }

    private int AfterQuantifier(int i)
    {
        if (i < n && p[i] == '?') return i + 1;
        if (i < n && p[i] == '+')
        {
            Add("VR012", i, 1, "");
            return i + 1;
        }
        return i;
    }

    private bool TryBrace(int i, out int end, out bool noMin)
    {
        end = i; noMin = false;
        int j = i + 1;
        int d1 = j;
        while (j < n && char.IsAsciiDigit(p[j])) j++;
        bool hasMin = j > d1;
        bool comma = false, hasMax = false;
        if (j < n && p[j] == ',')
        {
            comma = true;
            j++;
            int d2 = j;
            while (j < n && char.IsAsciiDigit(p[j])) j++;
            hasMax = j > d2;
        }
        if (j >= n || p[j] != '}') return false;
        if (!hasMin && !(comma && hasMax)) return false;
        noMin = !hasMin;
        end = j + 1;
        return true;
    }

    private int ParseName(int pos, char terminator, int failPos)
    {
        int j = pos;
        while (j < n && (char.IsAsciiLetterOrDigit(p[j]) || p[j] == '_')) j++;
        if (j == pos || j >= n || p[j] != terminator) throw Fail(failPos);
        return j;
    }

    private int Group(int s)
    {
        int i = s + 1;
        if (i >= n || p[i] != '?')
        {
            groups.Push(s);
            can = false;
            return i;
        }
        if (i + 1 >= n) throw Fail(s);
        char d = p[i + 1];
        switch (d)
        {
            case ':':
                groups.Push(s); can = false; return i + 2;
            case '=':
            case '!':
                Add("VR009", s, 3); groups.Push(s); can = false; return i + 2;
            case '>':
                Add("VR012", s, 3, "(?:"); groups.Push(s); can = false; return i + 2;
            case '<':
                if (i + 2 < n && (p[i + 2] == '=' || p[i + 2] == '!'))
                {
                    Add("VR008", s, 4); groups.Push(s); can = false; return i + 3;
                }
                else
                {
                    int e = ParseName(i + 2, '>', s);
                    Opener(s, e + 1 - s);
                    return e + 1;
                }
            case '\'':
            {
                int e = ParseName(i + 2, '\'', s);
                Opener(s, e + 1 - s);
                return e + 1;
            }
            case 'P':
                if (i + 2 < n && p[i + 2] == '<')
                {
                    int e = ParseName(i + 3, '>', s);
                    Opener(s, e + 1 - s);
                    return e + 1;
                }
                if (i + 2 < n && p[i + 2] == '=')
                {
                    int e = ParseName(i + 3, ')', s);
                    Add("VR011", s, e + 1 - s);
                    hasNameRef = true;
                    can = true;
                    return e + 1;
                }
                throw Fail(s);
            case '#':
            {
                int close = p.IndexOf(')', i);
                if (close < 0) throw Fail(s);
                return close + 1;
            }
            default:
            {
                int j = i + 1;
                while (j < n && "imsxnuUaLJ-".Contains(p[j])) j++;
                if (j == i + 1 || j >= n || (p[j] != ')' && p[j] != ':')) throw Fail(s);
                string flags = p.Substring(i + 1, j - i - 1);
                int dash = flags.IndexOf('-');
                string on = dash < 0 ? flags : flags[..dash];
                Add("VR013", s, j + 1 - s);
                if (on.Contains('i')) Add("VR021", s, j + 1 - s);
                if (p[j] == ':') { groups.Push(s); can = false; return j + 1; }
                can = false;
                return j + 1;
            }
        }
    }

    private void Opener(int s, int len)
    {
        var h = new Hit { Id = "VR011", Start = s, Length = len, Rewrite = "(" };
        hits.Add(h);
        openerHits.Add(h);
        groups.Push(s);
        can = false;
    }

    private bool Hex(int pos, int count)
    {
        if (pos + count > n) return false;
        for (int k = 0; k < count; k++) if (!char.IsAsciiHexDigit(p[pos + k])) return false;
        return true;
    }

    private static string? UnicodeRewrite(string hex)
    {
        if (!long.TryParse(hex, System.Globalization.NumberStyles.HexNumber, null, out long cp)) return null;
        if (cp > 0xFFFF || (cp >= 0xD800 && cp <= 0xDFFF)) return null;
        return "\\u" + cp.ToString("X4");
    }

    private int Escape(int s, bool inClass, out bool quantifiable, out bool shorthand)
    {
        quantifiable = true;
        shorthand = false;
        if (s + 1 >= n) throw Fail(s);
        char c = p[s + 1];
        int e = s + 2;
        switch (c)
        {
            case 'w': shorthand = true; Add("VR001", s, 2, ClassForm("VR001", inClass)); break;
            case 'd': shorthand = true; Add("VR002", s, 2, ClassForm("VR002", inClass)); break;
            case 's': shorthand = true; Add("VR003", s, 2, ClassForm("VR003", inClass)); break;
            case 'W': shorthand = true; Add("VR001", s, 2); break;
            case 'D': shorthand = true; Add("VR002", s, 2); break;
            case 'S': shorthand = true; Add("VR003", s, 2); break;
            case 'b':
            case 'B':
                if (!inClass) { Add("VR004", s, 2); quantifiable = false; }
                break;
            case 'A':
                Add("VR007", s, 2, inClass ? null : TableRewrite("VR007")); quantifiable = false; break;
            case 'Z':
            case 'z':
                Add("VR006", s, 2, inClass ? null : TableRewrite("VR006")); quantifiable = false; break;
            case '0':
                break;
            case >= '1' and <= '9':
                while (e < n && char.IsAsciiDigit(p[e])) e++;
                if (!inClass) Add("VR010", s, e - s);
                break;
            case 'x':
                if (e < n && p[e] == '{')
                {
                    int close = p.IndexOf('}', e);
                    if (close < 0 || close == e + 1 || !Hex(e + 1, close - e - 1)) throw Fail(s);
                    Add("VR019", s, close + 1 - s, UnicodeRewrite(p.Substring(e + 1, close - e - 1)));
                    e = close + 1;
                }
                else if (Hex(e, 2)) e += 2;
                else throw Fail(s);
                break;
            case 'u':
                if (e < n && p[e] == '{')
                {
                    int close = p.IndexOf('}', e);
                    if (close < 0 || close == e + 1 || !Hex(e + 1, close - e - 1)) throw Fail(s);
                    Add("VR019", s, close + 1 - s, UnicodeRewrite(p.Substring(e + 1, close - e - 1)));
                    e = close + 1;
                }
                else if (Hex(e, 4))
                {
                    e += 4;
                }
                else throw Fail(s);
                break;
            case 'U':
                if (!Hex(e, 8)) throw Fail(s);
                Add("VR019", s, 10, UnicodeRewrite(p.Substring(e, 8)));
                e += 8;
                break;
            case 'p':
            case 'P':
                if (e < n && p[e] == '{')
                {
                    int close = p.IndexOf('}', e);
                    if (close < 0 || close == e + 1) throw Fail(s);
                    e = close + 1;
                }
                else if (e < n && char.IsAsciiLetter(p[e])) e++;
                else throw Fail(s);
                Add("VR017", s, e - s);
                break;
            case 'k':
                if (e < n && (p[e] == '<' || p[e] == '\''))
                {
                    int close = ParseName(e + 1, p[e] == '<' ? '>' : '\'', s);
                    e = close + 1;
                }
                else throw Fail(s);
                Add("VR011", s, e - s);
                hasNameRef = true;
                break;
            case 'c':
                if (e < n && char.IsAsciiLetter(p[e])) e++;
                else throw Fail(s);
                break;
            default:
                if (char.IsAscii(c))
                {
                    if (!char.IsAsciiLetterOrDigit(c) && SyntaxChars.IndexOf(c) < 0 && !(inClass && c == '-'))
                        Add("VR026", s, 2, c == '-' ? "-" : c.ToString());
                }
                else if (char.IsHighSurrogate(c) && e < n) e++;
                break;
        }
        return e;
    }

    private static bool IsPosixName(string s) => s.Length > 0 && s.All(char.IsAsciiLetter);

    private int Class(int start, bool suppressOpen)
    {
        int i = start + 1;
        if (i < n && p[i] == '^')
        {
            i++;
            if (i < n && p[i] == ']')
            {
                Add("VR016", start, 3, TableRewrite("VR016"));
                return i + 1;
            }
        }
        else if (i < n && p[i] == ']') i++; // leading ] is a literal in most dialects

        int prevKind = 0, prevStart = 0; // 1 atom, 2 shorthand
        bool suppress = suppressOpen;
        while (true)
        {
            if (i >= n) throw Fail(start);
            char c = p[i];
            if (c == ']') return i + 1;
            if (c == '[')
            {
                if (i + 1 < n && p[i + 1] == ':')
                {
                    int close = p.IndexOf(":]", i + 2, StringComparison.Ordinal);
                    if (close > 0)
                    {
                        string name = p.Substring(i + 2, close - i - 2);
                        bool neg = name.StartsWith('^');
                        if (neg) name = name[1..];
                        if (IsPosixName(name))
                        {
                            Add("VR023", i, close + 2 - i, name == "alpha" && !neg ? ClassForm("VR023", true) : null);
                            i = close + 2; prevKind = 1; prevStart = i; suppress = false;
                            continue;
                        }
                    }
                }
                if (!suppress) Add("VR020", i, 1);
                suppress = false;
                i = Class(i, false);
                prevKind = 1; prevStart = i;
                continue;
            }
            if (c == '-')
            {
                if (i + 1 < n && p[i + 1] == '[')
                {
                    Add("VR020", i, 2); suppress = true; i++; prevKind = 0; continue;
                }
                if (i + 1 < n && p[i + 1] == '-')
                {
                    Add("VR020", i, 2); i += 2; suppress = i < n && p[i] == '['; prevKind = 0; continue;
                }
                bool hasNext = i + 1 < n && p[i + 1] != ']';
                if (hasNext && prevKind == 2) Add("VR022", prevStart, i + 1 - prevStart);
                else if (hasNext && prevKind == 1 && p[i + 1] == '\\' && i + 2 < n && "wdsWDS".Contains(p[i + 2])) Add("VR022", i, 3);
                prevKind = 1; prevStart = i; i++;
                continue;
            }
            if (c == '&' && i + 1 < n && p[i + 1] == '&')
            {
                Add("VR020", i, 2); i += 2; prevKind = 0; continue;
            }
            if (c == '\\')
            {
                int s = i;
                i = Escape(i, true, out _, out bool sh);
                prevKind = sh ? 2 : 1; prevStart = s;
                continue;
            }
            prevKind = 1; prevStart = i;
            i += char.IsHighSurrogate(c) && i + 1 < n ? 2 : 1;
        }
    }
}
