"""The app icon (owner, 2026-09-29): 小昭 and 阿胖's faces side by side, each in a round cream badge with a white ring, 阿胖's
overlapping 小昭's a little. Faces from the spike's finished stills: 小昭's lying still, 阿胖's face portrait (af2), keyed and
centred between the amber eyes. Writes build/icon.png (1024 px, Windows and Mac).
  C:/Users/USER/pet-ai-spike/.venv/Scripts/python.exe tools/make_icon.py"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

sys.path.insert(0, 'C:/Users/USER/pet-ai-spike')
from af7_stage import key_hue    # noqa: E402  (the spike's keying: green stage out, green cast off the fur)

SPIKE = Path('C:/Users/USER/pet-ai-spike/work')
FACES = [('xiaozhao', SPIKE / 'xz/final/lie.png'), ('apang', SPIKE / 'af/portraits/face.png')]
SIZE = 1024
BADGE = 560                                   # each badge's diameter
CENTRES = [(330, 540), (694, 484)]            # 小昭 left and a little lower, 阿胖 right, overlapping in the middle
CREAM = (251, 243, 230, 255)
RING = 22


def face(path: Path) -> Image.Image:
    """The keyed head, square, centred between the eyes and cut a little above the ear tips."""
    img = key_hue(Image.open(path).convert('RGB'))
    a = np.asarray(img).astype(np.int16)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    amber = (al > 128) & (r > 150) & (g > 70) & (g < 200) & (b < 110) & (r - b > 90) & (r - g > 25)
    lab, n = ndimage.label(ndimage.binary_opening(amber))
    eyes = sorted(((lab == i).sum(), i) for i in range(1, n + 1))[-2:]
    ys, xs = np.nonzero(np.isin(lab, [i for _, i in eyes]))
    cx, cy = xs.mean(), ys.mean()
    head = al[:, int(cx - 0.6 * (xs.max() - xs.min()) - 40):int(cx + 0.6 * (xs.max() - xs.min()) + 40)] > 128
    top = np.nonzero(head.any(1))[0].min()
    side = (cy - top) * 2.6                   # ear tips to eyes, then as far again and more: down to the chin and cheeks
    box = (int(cx - side / 2), int(top - side * 0.06), int(cx + side / 2), int(top - side * 0.06 + side))
    return img.convert('RGBa').crop(box).resize((BADGE, BADGE), Image.LANCZOS).convert('RGBA')


def badge(head: Image.Image) -> Image.Image:
    d = BADGE + 2 * RING
    out = Image.new('RGBA', (d, d), (0, 0, 0, 0))
    ImageDraw.Draw(out).ellipse((0, 0, d - 1, d - 1), fill=(255, 255, 255, 255))
    inner = Image.new('RGBA', (BADGE, BADGE), CREAM)
    inner.alpha_composite(head)
    mask = Image.new('L', (BADGE, BADGE), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, BADGE - 1, BADGE - 1), fill=255)
    out.paste(inner, (RING, RING), mask)
    return out


if __name__ == '__main__':
    icon = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    for (name, path), (x, y) in zip(FACES, CENTRES):
        b = badge(face(path))
        icon.alpha_composite(b, (x - b.width // 2, y - b.height // 2))
    Path('build').mkdir(exist_ok=True)
    icon.save('build/icon.png')
    print('build/icon.png', icon.size)
