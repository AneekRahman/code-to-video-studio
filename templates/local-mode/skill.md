# Example title card

A starter mode: one animated title over a solid colour, with a silent
soundtrack. Copy `templates/local-mode/` to `local-modes/<your-mode-id>/`,
replace `example-title-card` with the new id everywhere in the copy, and grow
it into the mode the plan describes.

1. Write `card.json` from `card.template.json`.
2. Write the job manifest: mode `example-title-card`, the card as input
   `card` with its SHA-256, no assets, and a duration equal to the card's.
   `fixture()` in `mode.ts` shows a complete one.
3. `pnpm studio run --job <job.json> --out work/<store>`, then
   `pnpm studio verify --result <run directory>`.
