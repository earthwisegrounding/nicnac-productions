"""
Neon-on-black photo -> transparent WebP that composites like light.

"Unscreen": a pixel's opacity is its brightness above the black level, and its colour is
un-premultiplied by that opacity, so over a dark page it reproduces the original glow.
Extra care for a JPEG source: the dim halo is smoothed (JPEG blocks live there), the faintest
haze is tapered away, and the edges are feathered so the image has no visible boundary.
The page adds its own clean glow behind it.

uv run --with pillow --with numpy python neon_to_alpha.py in.jpg out.webp [scale=2] [black=0.012]
"""
import sys
import numpy as np
from PIL import Image, ImageFilter

src, dst = sys.argv[1], sys.argv[2]
opts = dict(a.split('=') for a in sys.argv[3:])
scale = float(opts.get('scale', 2))
black = float(opts.get('black', 0.012))
quality = int(opts.get('q', 88))

im = Image.open(src).convert('RGB')
if scale != 1:
    im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
rgb = np.asarray(im).astype(np.float32) / 255.0
soft = np.asarray(im.filter(ImageFilter.GaussianBlur(5 * scale))).astype(np.float32) / 255.0

# the dim halo comes from the blurred copy (no JPEG blocks); tubes stay sharp
lum = rgb.max(axis=2)
keep = np.clip((lum - 0.05) / 0.2, 0, 1)[..., None]
rgb = rgb * keep + soft * (1 - keep)

lum = rgb.max(axis=2)
alpha = np.clip((lum - black) / (1 - black), 0, 1)
# taper the faintest haze (below ~4% it is mostly noise on a real screen)
alpha *= np.clip((alpha - 0.012) / 0.05, 0, 1) ** 1.5
col = np.clip((rgb - black) / np.maximum(alpha, 1e-4)[..., None], 0, 1)
col[alpha < 1e-3] = 0

# crop to the light
ys, xs = np.where(alpha > 0.04)
pad = int(30 * scale)
y0, y1 = max(ys.min() - pad, 0), min(ys.max() + pad, alpha.shape[0])
x0, x1 = max(xs.min() - pad, 0), min(xs.max() + pad, alpha.shape[1])
col, alpha = col[y0:y1, x0:x1], alpha[y0:y1, x0:x1]

# feather: elliptical falloff so nothing ever reaches the image edge
h, w = alpha.shape
yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
d = np.sqrt(((xx - w / 2) / (w / 2)) ** 2 * 0.55 + ((yy - h / 2) / (h / 2)) ** 2)
feather = np.clip((1.02 - d) / 0.28, 0, 1)
feather = feather * feather * (3 - 2 * feather)
alpha *= feather

img = Image.fromarray((np.dstack([col, alpha]) * 255 + 0.5).astype(np.uint8), 'RGBA')
img.save(dst, quality=quality, alpha_quality=90, method=6)
print(f'{dst}: {img.width}x{img.height}  crop x{x0}-{x1} y{y0}-{y1}  (source scale {scale})')
