#!/bin/zsh
# Encode rendered loops + eye sprites + stills into site/public/media.
set -e
cd "$(dirname "$0")"
M=../site/public/media
mkdir -p $M/eye

enc() { # $1 frames dir, $2 name, $3 optional scale (e.g. 1280:720)
  local -a vf=()
  [[ -n ${3} ]] && vf=(-vf "scale=${3}:flags=lanczos")
  ffmpeg -y -loglevel error -framerate 24 -i $1/f_%04d.png "${vf[@]}" -c:v libx264 -preset slow -crf 21 -pix_fmt yuv420p -profile:v high -movflags +faststart -an $M/$2.mp4
}
encwebm() {
  ffmpeg -y -loglevel error -framerate 24 -i $1/f_%04d.png -c:v libvpx-vp9 -crf 34 -b:v 0 -row-mt 1 -deadline good -cpu-used 2 -pix_fmt yuv420p -an $M/$2.webm
}

if [[ -d renders/loop_land ]]; then
  enc renders/loop_land hero-1080
  enc renders/loop_land hero-720 1280:720
  encwebm renders/loop_land hero-1080
  cwebp -quiet -q 82 renders/loop_land/f_0001.png -o $M/poster-1920.webp
fi
if [[ -d renders/loop_port ]]; then
  enc renders/loop_port hero-portrait
  encwebm renders/loop_port hero-portrait
  cwebp -quiet -q 80 -resize 1080 1920 renders/loop_port/f_0001.png -o $M/poster-portrait.webp
fi
for f in renders/eye/eye_*.png(N); do
  cwebp -quiet -q 84 -alpha_q 90 -m 6 $f -o $M/eye/${${f:t}%.png}.webp
done
[[ -f renders/eye/eye.json ]] && cp renders/eye/eye.json ../site/src/data/eye.json
for f in about-iris svc-1 svc-2 svc-3; do
  [[ -f renders/stills/$f.png ]] && cwebp -quiet -q 80 -m 6 renders/stills/$f.png -o $M/$f.webp
done
ls -la $M
