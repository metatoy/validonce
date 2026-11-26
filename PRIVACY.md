# Privacy

This page covers the validonce Claude Code plugin, including the edition in Anthropic's plugin directory (`plugin/`), and the validonce libraries.

## The directory edition of the plugin (`plugin/`)

- It is instructions and reference guides only: no code, no scripts, no MCP server.
- It reads files in the project you open it in, through the agent's own read tools, to find validation checks.
- It runs nothing, makes no network calls, and sends your code or data nowhere.
- It collects, stores and keeps nothing. Metatoy LLC receives no data from it.

What you type and the files the agent reads are handled by Claude under Anthropic's terms and privacy policy, not by this plugin.

## The full plugin and the MCP server (`validonce-mcp`)

- The MCP server runs on your computer. It reads files inside the project folders your agent shares with it and writes only the files you ask for (for example generated inputs in a scratch folder).
- It makes no network calls and has no telemetry. `npx` downloads the package from npm when it first starts, as with any npm package.
- Running your old validator, to compare old and new behaviour, happens only after you say yes, in a scratch folder.

## The libraries

The validonce packages (npm, PyPI, NuGet, Go, Maven Central) evaluate rules in your own application. They collect nothing and send nothing to Metatoy LLC or anyone else. The only network request any of them makes is the `<validonce-form>` web component (`validonce/dom-element`) loading the OpenAPI document from the URL your page gives it, which is your own API.

## Contact

Questions: open an issue at https://github.com/metatoy/validonce/issues, or email oss@metatoy.com. Security problems: see [SECURITY.md](SECURITY.md).
