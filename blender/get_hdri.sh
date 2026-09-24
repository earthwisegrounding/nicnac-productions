#!/bin/zsh
# Fetch the CC0 studio HDRIs the scene uses (Poly Haven).
cd "$(dirname "$0")" && mkdir -p hdri
for id in studio_small_09 brown_photostudio_02; do
  curl -sL "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/${id}_2k.hdr" -o hdri/$id.hdr
done
ls -la hdri
