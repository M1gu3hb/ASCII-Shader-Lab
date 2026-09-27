#!/usr/bin/env bash
# Morphiq credit logo for the footer (see MORPHIQ in src/shared/site.ts).
#
#   scripts/seo-logo.sh path/to/original.png
#
# - public/brand/morphiq/morphiq-logo.png: the owner's original, only losslessly recompressed
#   (optipng keeps every pixel and the sRGB chunk; checked with ImageMagick: 0 differing pixels).
# - morphiq-logo-{128,256,384}.{png,webp}: 1x/2x/3x of the displayed 128×37 (exactly 1536:444),
#   Lanczos resize with alpha, lossless PNG and lossless WebP. Never redraw, recolour or crop.
# Needs ImageMagick 6 (convert, compare), optipng and cwebp.
set -euo pipefail
src="${1:?ruta al PNG original}"
out="$(dirname "$0")/../public/brand/morphiq"
mkdir -p "$out"

cp "$src" "$out/morphiq-logo.png"
optipng -quiet -o7 -preserve "$out/morphiq-logo.png"
diff_px="$(compare -channel RGBA -metric AE "$src" "$out/morphiq-logo.png" null: 2>&1 || true)"
[ "$diff_px" = "0" ] || { echo "la optimización cambió $diff_px píxeles" >&2; exit 1; }

for w in 128 256 384; do
  h=$(( w * 444 / 1536 ))
  convert "$out/morphiq-logo.png" -filter Lanczos -resize "${w}x${h}!" -strip "$out/morphiq-logo-$w.png"
  optipng -quiet -o7 "$out/morphiq-logo-$w.png"
  cwebp -quiet -lossless -z 9 -exact "$out/morphiq-logo-$w.png" -o "$out/morphiq-logo-$w.webp"
done
ls -l "$out"
