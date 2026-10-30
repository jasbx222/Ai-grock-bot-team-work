"""Chroma-key the generated green-screen art into transparent PNG sprites (public/art)."""
import numpy as np
from PIL import Image, ImageFilter
import glob, os, json

OUT = 'public/art'

def key(img):
    a = np.asarray(img.convert('RGB')).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    dom = g - np.maximum(r, b)
    alpha = np.clip(1 - (dom - 28) / 50, 0, 1)
    # despill: clamp green on semi/opaque pixels
    spill = g > np.maximum(r, b)
    g2 = np.where(spill, np.maximum(r, b) + (g - np.maximum(r, b)) * 0.15, g)
    rgb = np.stack([r, g2, b], -1)
    al = Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
    out = Image.fromarray(rgb.astype(np.uint8)).convert('RGBA'); out.putalpha(al)
    return out

def components_x(rgba, min_gap=12):
    al = np.asarray(rgba)[..., 3] > 40
    cols = al.sum(0) > 2
    spans, start, gap = [], None, 0
    for x, c in enumerate(cols):
        if c:
            if start is None: start = x
            gap = 0; end = x
        elif start is not None:
            gap += 1
            if gap > min_gap: spans.append((start, end)); start = None
    if start is not None: spans.append((start, end))
    return [s for s in spans if s[1] - s[0] > 40]

def trim(rgba, pad=6):
    al = np.asarray(rgba)[..., 3] > 20
    ys, xs = np.where(al)
    box = (max(xs.min() - pad, 0), max(ys.min() - pad, 0), min(xs.max() + pad, rgba.width), min(ys.max() + pad, rgba.height))
    return rgba.crop(box)

def save(im, name, maxh):
    if im.height > maxh: im = im.resize((round(im.width * maxh / im.height), maxh), Image.LANCZOS)
    im.save(f'{OUT}/{name}.png', optimize=True); return im.size

meta = {}
for f in sorted(glob.glob('art-src/sit_*.jpg')) + ['art-src/desk_empty.jpg']:
    n = os.path.basename(f)[:-4]
    meta[n] = save(trim(key(Image.open(f))), n, 640)
for f in sorted(glob.glob('art-src/stand_*.jpg')):
    n = os.path.basename(f)[6:-4]
    k = key(Image.open(f)); sp = components_x(k)
    assert len(sp) == 2, (f, sp)
    for (x0, x1), tag in zip(sp, ['idle', 'walk']):
        meta[f'{tag}_{n}'] = save(trim(k.crop((x0, 0, x1 + 1, k.height))), f'{tag}_{n}', 520)
k = key(Image.open('art-src/pets.jpg')); sp = components_x(k)
assert len(sp) == 2, sp
for (x0, x1), n in zip(sp, ['cat', 'dog']):
    meta[n] = save(trim(k.crop((x0, 0, x1 + 1, k.height))), n, 360)
bg = Image.open('art-src/room_bg.jpg').convert('RGB')
bg2 = bg.resize((2560, 1440), Image.LANCZOS).filter(ImageFilter.UnsharpMask(1.2, 40, 2))
bg2.save(f'{OUT}/room_bg.jpg', quality=88, optimize=True, progressive=True); meta['room_bg'] = bg2.size
json.dump(meta, open('art-src/sizes.json', 'w'), indent=1)
print(json.dumps(meta))

# ---- face avatars (for the team list / chat header), cropped from the standing sprite
def face(name):
    im = Image.open(f'{OUT}/idle_{name}.png'); a = np.asarray(im)[..., 3] > 60
    top = np.where(a.any(1))[0][0]; h = im.height
    band = a[top + int(h * 0.06):top + int(h * 0.2)]
    xs = np.where(band.any(0))[0]; cx = (xs.min() + xs.max()) / 2
    side = int(h * 0.27); y0 = max(top - int(h * 0.01), 0)
    box = (int(cx - side / 2), y0, int(cx + side / 2), y0 + side)
    bg = Image.new('RGBA', (side, side), (243, 226, 200, 255))
    bg.alpha_composite(im.crop(box))
    bg.resize((128, 128), Image.LANCZOS).convert('RGB').save(f'{OUT}/face_{name}.jpg', quality=90)
for n in ['dev01b', 'planbot', 'dawrli', 'marketing', 'messaging', 'generic1', 'generic2']: face(n)
