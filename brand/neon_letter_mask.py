"""
Soft mask of one letter's own light, for making a single tube sputter.

Takes the transparent sign (from neon_to_alpha.py), keeps only the light inside one letter's
box, blurs it into that letter's glow footprint, and writes it plus its exact complement, so the
two layers add back to the whole sign when both are lit.

uv run --with pillow --with numpy python neon_letter_mask.py sign.webp out-prefix x0 x1 [y0=0.18] [y1=0.8]
  x0, x1: the letter's horizontal extent as fractions of the image width
"""
import sys
import numpy as np
from PIL import Image, ImageFilter

src, prefix = sys.argv[1], sys.argv[2]
x0, x1 = float(sys.argv[3]), float(sys.argv[4])
opts = dict(a.split('=') for a in sys.argv[5:])
y0, y1 = float(opts.get('y0', 0.18)), float(opts.get('y1', 0.8))

im = Image.open(src)
small = im.resize((im.width // 4, im.height // 4), Image.LANCZOS)   # masks are smooth: low-res is plenty
a = np.asarray(small.getchannel('A')).astype(np.float32) / 255.0
h, w = a.shape
box = np.zeros_like(a)
box[int(y0 * h):int(y1 * h), int(x0 * w):int(x1 * w)] = 1
m = np.clip(a * 3.0, 0, 1) * box                       # the letter's tube and its near glow
blob = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(w * 0.018))
m = np.asarray(blob).astype(np.float32) / 255.0
m = np.clip(m / max(m.max(), 1e-6) * 1.9, 0, 1)
m = m * m * (3 - 2 * m)                                 # smooth the shoulder

for name, arr in (('letter', m), ('rest', 1 - m)):
    mask = np.zeros((h, w, 4), np.uint8)
    mask[..., 3] = (arr * 255 + 0.5).astype(np.uint8)
    Image.fromarray(mask, 'RGBA').save(f'{prefix}-{name}.png', optimize=True)
print(f'{prefix}-letter.png / -rest.png  {w}x{h}')
