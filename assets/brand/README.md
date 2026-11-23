# validonce brand

Mark: 02c "Open and solid ends". Hollow bracket = client, solid bracket = server, the check locks into both. Color C1 (N8 green).

## Colors
| Role | Dark | Light |
|---|---|---|
| Tile / background | #231f20 | #e8e2d2 |
| Brackets | #a6a298 | #6e6a63 |
| Client bracket, small cut | #6e6a63 | #a39d90 |
| Check (accent) | #8dc63f | #4f7a17 |
| Wordmark | #f2efe6 | #231f20 |

## Type
Wordmark: Interstate Bold, -0.02em tracking, lowercase. Outlined in every SVG, so no font is needed to render it.

## Sizes
- 96 px and up: `icon-*.svg` (hollow client bracket)
- 64 px and below: `icon-*-small.svg` (solid client bracket in a lower value, scaled up)
- `icon-*-square.svg`: full-bleed square for iOS and Android, which apply their own corner mask

## Files
- `svg/`: icon, small cut, square, bare mark, wordmark, lockup (dark and light)
- `png/`: icons at 1024 to 16, lockups at 320 px tall
- `favicon/`: favicon.svg, favicon.ico (16/32/48), PNGs, apple-touch-icon, android-chrome
- `banner/`: README banner 1280x320 (PNG at 2x). Tagline (placeholder until the founder picks one): "Write rules once. Enforce them everywhere." at 19 px. Re-export with `rsvg-convert -z 2 readme-banner-<light|dark>.svg -o readme-banner-<light|dark>.png`. The tagline font is JetBrains Mono; install it before exporting, or the PNG uses a fallback monospace font.

## Notes
- The knockout gap around the check is drawn in the tile color. On a different background use the icon tiles, not the bare mark.
- No trademark is planned for validonce (founder, 2026-11-22). The closest mark in developer tools is Checkmarx (a green check in an open box); worth a look before the logo goes public.
- Use of these files: see `LICENSE` in this folder (not Apache-2.0).
