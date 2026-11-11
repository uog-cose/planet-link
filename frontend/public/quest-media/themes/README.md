# Youth Quest Theme Artwork

Theme assets are referenced from `/quest-media/themes/`. The `theme/colors.ts` presets register `space`, `cleaning`, `music`, `arts`, and `games`; `theme.ts` maps those keys to the matching backgrounds. The Theme Studio uses matching banners and icons.

## Asset layout
- `backgrounds/*-background.jpg` — HD page background images (2560 × 1440).
- `banners/*-banner.jpg` — wide themed artwork (1920 × 560).
- `theme-icons/<theme>/<theme>-icon.png` — tile and Theme Studio icon.
- `navigation/` — shared navigation SVG/PNG assets.
- `rewards/` — in-app trophy, medal, treasure chest, theme collectibles, and scratch-card SVG.
- `rewards/icons/` — 12 additional reward icon concepts, each supplied as scalable SVG and 1024 × 1024 transparent PNG: trophy, scratch card, medal, star, treasure chest, gift box, badge, XP bolt, voucher, heart, mystery box, and celebration.
- `asset-manifest.json` — URL/palette manifest for UI integration.

Use the warm green, teal, coral, amber and gold palettes defined in `theme/colors.ts`; avoid blue/purple accents unless a specific use case requires them.
