"""The app icon (owner, 2026-09-29): 小昭 and 阿胖's heads, cut out, side by side on nothing (no badges - the owner did not want
circles). Heads from the spike's finished stills: 小昭's lying still, 阿胖's face portrait (af2), keyed; each is kept to a soft oval
from the ear tips to the chin (the neck and anything behind fade out), sized by the distance between the amber eyes so both
heads match - 阿胖's 5% bigger, as in the app. Writes build/icon.png (1024 px, Windows and Mac).
  C:/Users/USER/pet-ai-spike/.venv/Scripts/python.exe tools/make_icon.py"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, 'C:/Users/USER/pet-ai-spike')
from af7_stage import key_hue    # noqa: E402  (the spike's keying: green stage out, green cast off the fur)

SPIKE = Path('C:/Users/USER/pet-ai-spike/work')
HEADS = [('xiaozhao', SPIKE / 'xz/final/lie.png', 1.0), ('apang', SPIKE / 'af/portraits/face.png', 1.05)]
SIZE = 1024
EYE_GAP = 172                 # px between the eyes in the icon (小昭; 阿胖 x1.05)
CENTRES = [(304, 548), (758, 530)]   # where each head's eyes sit


def eyes(al, rgb):
    a = rgb.astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    amber = (al > 128) & (r > 150) & (g > 70) & (g < 200) & (b < 110) & (r - b > 90) & (r - g > 25)
    lab, n = ndimage.label(ndimage.binary_dilation(ndimage.binary_opening(amber), iterations=4))
    blobs = sorted(((lab == i).sum(), np.nonzero(lab == i)) for i in range(1, n + 1))[::-1]
    first = blobs[0][1]
    second = next(p for _, p in blobs[1:] if abs(p[1].mean() - first[1].mean()) > 30)
    return [(p[1].mean(), p[0].mean()) for p in (first, second)]


def head(path: Path, gap: float) -> tuple:
    """The keyed head scaled so its eyes are `gap` apart, kept to a soft oval; and where its eyes' midpoint is in it."""
    img = key_hue(Image.open(path).convert('RGB'))
    a = np.asarray(img)
    (x1, y1), (x2, y2) = eyes(a[..., 3], a[..., :3])
    s = gap / abs(x1 - x2)
    img = img.convert('RGBa').resize((round(img.width * s), round(img.height * s)), Image.LANCZOS).convert('RGBA')
    cx, cy = (x1 + x2) / 2 * s, (y1 + y2) / 2 * s
    # the oval: cheek to cheek, down to the chin (about 1.2 eye gaps below the eyes); upwards it reaches well past the ear tips,
    # so the ears stay whole - nothing but the head is up there
    rx, ry_up, ry_down = 1.62 * gap, 2.4 * gap, 1.25 * gap
    yy, xx = np.mgrid[0:img.height, 0:img.width]
    d = np.sqrt(((xx - cx) / rx) ** 2 + ((yy - cy) / np.where(yy < cy, ry_up, ry_down)) ** 2)
    fade = np.clip((1.0 - d) / 0.12, 0, 1)             # fades out over the oval's last 12%
    arr = np.asarray(img).astype(np.float32)
    arr[..., 3] *= fade
    return Image.fromarray(arr.clip(0, 255).astype(np.uint8), 'RGBA'), (cx, cy)


if __name__ == '__main__':
    icon = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    for (name, path, big), (x, y) in zip(HEADS, CENTRES):
        h, (cx, cy) = head(path, EYE_GAP * big)
        icon.alpha_composite(h, (round(x - cx), round(y - cy)))   # alpha_composite clips what falls outside
    Path('build').mkdir(exist_ok=True)
    icon.save('build/icon.png')
    print('build/icon.png', icon.size)
