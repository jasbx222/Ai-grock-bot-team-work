"""Chroma-key generated walk-cycle strips (art-src/walk/*.jpg) into uniform 4-frame sprite sheets public/art/walk4_<key>.webp (lossless-alpha WebP, q90)."""
import numpy as np, glob, os, json
from PIL import Image, ImageFilter
from scipy import ndimage

def key(img):
    a = np.asarray(img.convert('RGB')).astype(np.float32)
    h, w, _ = a.shape
    corners = np.concatenate([a[:20, :20].reshape(-1, 3), a[:20, -20:].reshape(-1, 3), a[-20:, :20].reshape(-1, 3), a[-20:, -20:].reshape(-1, 3), a[:8].reshape(-1,3)])
    bg = np.median(corners, 0)
    d = np.sqrt(((a - bg) ** 2).sum(-1))
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    dom = g - np.maximum(r, b)
    bgdom = bg[1] - max(bg[0], bg[2])
    alpha = np.clip((d - 38) / 40, 0, 1)
    alpha = np.where(dom > bgdom * 0.6, np.minimum(alpha, np.clip(1 - (dom - bgdom * 0.45) / (bgdom * 0.4 + 1), 0, 1)), alpha)
    spill = g > np.maximum(r, b)
    g2 = np.where(spill, np.maximum(r, b) + (g - np.maximum(r, b)) * 0.2, g)
    al = Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.7))
    out = Image.fromarray(np.stack([r, g2, b], -1).astype(np.uint8)).convert('RGBA'); out.putalpha(al)
    # keep only big blobs
    m = np.asarray(al) > 60
    lab, n = ndimage.label(m)
    sizes = ndimage.sum(m, lab, range(1, n + 1))
    keep = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s > 3000])
    keep = ndimage.binary_dilation(keep, iterations=3)
    A = np.asarray(out).copy(); A[..., 3] = np.where(keep, A[..., 3], 0)
    return Image.fromarray(A)

def frames(rgba, n=4):
    A = np.asarray(rgba)[..., 3] > 60
    lab, k = ndimage.label(ndimage.binary_dilation(A, iterations=6))
    objs = ndimage.find_objects(lab)
    boxes = sorted([(o[1].start, o[0].start, o[1].stop, o[0].stop, i + 1) for i, o in enumerate(objs) if (o[1].stop - o[1].start) * (o[0].stop - o[0].start) > 20000], key=lambda b: b[0])
    return boxes, lab

FH = 400
FACE_LEFT = {'planbot', 'marketing'}
meta = {}
for f in sorted(glob.glob('art-src/walk/*.jpg')):
    name = os.path.basename(f)[:-4]
    im = key(Image.open(f))
    if name == 'owner_idle':
        al = np.asarray(im)[..., 3] > 30; ys, xs = np.where(al)
        c = im.crop((xs.min() - 4, ys.min() - 4, xs.max() + 4, ys.max() + 4)); s = 640 / c.height
        c = c.resize((round(c.width * s), 640), Image.LANCZOS); c.save('public/art/idle_owner.webp', quality=90, method=6); meta['idle_owner'] = c.size; continue
    if name in FACE_LEFT: im = im.transpose(Image.FLIP_LEFT_RIGHT)
    boxes, lab = frames(im)
    if len(boxes) != 4: print('WARN', name, len(boxes), boxes)
    boxes = boxes[:4]
    A = np.asarray(im)
    crops = []; masks = []
    for (x0, y0, x1, y1, li) in boxes:
        M = A.copy(); M[..., 3] = np.where(lab == li, M[..., 3], 0); masks.append(Image.fromarray(M))
        sub = A[y0:y1, x0:x1, 3] > 60
        ys, xs = np.where(sub)
        top = ys.min()
        # anchor x: centre of the upper 45% (head + torso) -> body doesn't jitter
        hh = ys.max() - top
        up = sub[top:top + int(hh * 0.45)]
        cx = np.where(up)[1].mean()
        crops.append((x0, y0 + top, x1, y0 + ys.max() + 1, x0 + cx))
    H = max(c[3] - c[1] for c in crops); base = max(c[3] for c in crops)
    left = max(c[4] - c[0] for c in crops); right = max(c[2] - c[4] for c in crops)
    W = int(left + right) + 8; top = base - H - 6
    s = FH / (base - top)
    cw = round(W * s)
    sheet = Image.new('RGBA', (cw * 4, FH))
    for i, c in enumerate(crops):
        x0 = int(c[4] - left - 4)
        cell = masks[i].crop((x0, int(top), x0 + W, int(base))).resize((cw, FH), Image.LANCZOS)
        sheet.paste(cell, (i * cw, 0))
    sheet.save(f'public/art/walk4_{name}.webp', quality=90, method=6)
    meta[f'walk4_{name}'] = [cw, FH, 4]
    print(name, sheet.size, os.path.getsize(f'public/art/walk4_{name}.webp') // 1024, 'KB')
json.dump(meta, open('art-src/walk/sizes.json', 'w'), indent=1)
