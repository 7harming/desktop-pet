"""Convert 小昭's approved clips from the feasibility spike into a desktop-pet pack (spec 2026-09-27, appendix A).

Run with the spike's Python (it has numpy, Pillow and imageio-ffmpeg):
  C:/Users/USER/pet-ai-spike/.venv/Scripts/python.exe tools/convert_xiaozhao.py
"""
import argparse
import io
import json
import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg
import numpy as np
from PIL import Image

CLIPS = ['idle_lie', 'idle_lie_groom', 'idle_sit', 'lie_to_sit', 'sit_to_lie', 'idle_sleep', 'lie_to_sleep', 'sleep_to_lie',
         'box_enter', 'box_idle', 'box_exit', 'pillow_enter', 'pillow_idle', 'pillow_exit']
STILLS = {'lie': 'lie.png', 'sit': 'sit.png', 'sleep': 'sleep.png', 'boxBelly': 'end_box.png', 'pillow': 'end_pillow.png'}
GROUND = 652 / 720          # every still was staged with the feet / prop bottom on this line
FF = imageio_ffmpeg.get_ffmpeg_exe()


def keyed_alpha(img: Image.Image) -> np.ndarray:
    a = np.asarray(img.convert('RGB')).astype(np.float32)
    bg = np.median(np.concatenate([a[:15].reshape(-1, 3), a[:, :15].reshape(-1, 3), a[:, -15:].reshape(-1, 3)]), axis=0)
    return np.clip((np.linalg.norm(a - bg, axis=2) - 40) / 60, 0, 1)


def geometry(still: Path) -> dict:
    al = keyed_alpha(Image.open(still))
    ys, xs = np.nonzero(al > 0.5)
    h, w = al.shape
    return {'ground': round(GROUND, 3), 'centerX': round(float(xs.min() + xs.max()) / 2 / w, 3), 'head': round(GROUND - ys.min() / h, 3)}


def bg_colour(src: Path) -> str:
    raw = subprocess.run([FF, '-v', 'error', '-i', str(src), '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '64x36', '-'],
                         capture_output=True, check=True).stdout
    f = np.frombuffer(raw, np.uint8).reshape(36, 64, 3)
    bg = np.concatenate([f[:3, :3].reshape(-1, 3), f[:3, -3:].reshape(-1, 3)]).mean(0)
    return '0x%02X%02X%02X' % tuple(int(round(c)) for c in bg)


def key_filter(src: Path) -> str:
    return f'format=rgba,chromakey={bg_colour(src)}:0.14:0.06,despill=type=green:mix=0.6:expand=0.1'


def key_clip(src: Path, dst: Path) -> None:
    vf = f'scale=960:540,{key_filter(src)}'
    subprocess.run([FF, '-y', '-loglevel', 'error', '-i', str(src), '-vf', vf, '-r', '24', '-c:v', 'libvpx-vp9',
                    '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '32', '-auto-alt-ref', '0', '-an', str(dst)], check=True)


def portrait(lie: Path, dst: Path) -> None:
    # key the still with the same filter as the clips, so the portrait's edge matches the cat on the desktop
    png = subprocess.run([FF, '-v', 'error', '-i', str(lie), '-vf', key_filter(lie), '-f', 'image2pipe', '-vcodec', 'png', '-'],
                         capture_output=True, check=True).stdout
    img = Image.open(io.BytesIO(png)).convert('RGBA')
    al = np.asarray(img)[..., 3] / 255
    ys, xs = np.nonzero(al > 0.5)
    top = ys.min()
    band = al[top:top + 60] > 0.5
    cx = np.nonzero(band.any(0))[0].mean()
    size = 220
    box = (int(cx - size / 2), int(top - 10), int(cx + size / 2), int(top - 10 + size))
    # resize premultiplied, so the transparent stage colour does not bleed into the edge
    img.convert('RGBa').crop(box).resize((256, 256), Image.LANCZOS).convert('RGBA').save(dst)


def build_pack(geo: dict) -> dict:
    lie = geo['lie']
    return {
        'schemaVersion': 1, 'id': 'xiaozhao', 'name': '小昭', 'personality': '淡定、愛翻肚、最愛紙箱', 'portrait': 'portrait.png',
        'frame': {'aspect': round(16 / 9, 4), 'displayHeight': 440},
        'start': 'lie',
        'poses': {
            'lie': {'label': '趴著', 'idle': ['idle_lie', 'idle_lie_groom'], **lie, 'shadow': True, 'draggable': True, 'stay': 0.7, 'autoWeight': 1},
            'sit': {'label': '坐著', 'idle': ['idle_sit'], **geo['sit'], 'shadow': True, 'draggable': False, 'stay': 0.6, 'autoWeight': 0.6},
            'sleep': {'label': '睡覺', 'idle': ['idle_sleep'], **geo['sleep'], 'shadow': True, 'draggable': False, 'asleep': True, 'stay': 0.85, 'autoWeight': 0.8},
            'lieBox': {'label': '（紙箱出現）', 'transient': True, **lie, 'shadow': True},
            'boxBelly': {'label': '紙箱翻肚', 'idle': ['box_idle'], **geo['boxBelly'], 'shadow': False, 'draggable': False, 'asleep': True, 'stay': 0.85, 'autoWeight': 1.4},
            'liePillow': {'label': '（抱枕出現）', 'transient': True, **lie, 'shadow': True},
            'pillow': {'label': '藍色抱枕', 'idle': ['pillow_idle'], **geo['pillow'], 'shadow': False, 'draggable': False, 'stay': 0.7, 'autoWeight': 1},
        },
        'clips': {c: {'file': f'clips/{c}.webm', **({'rate': 0.8} if c in ('box_exit', 'pillow_enter') else {})} for c in CLIPS},
        'edges': [
            {'from': 'lie', 'to': 'sit', 'clip': 'lie_to_sit'}, {'from': 'sit', 'to': 'lie', 'clip': 'sit_to_lie'},
            {'from': 'lie', 'to': 'sleep', 'clip': 'lie_to_sleep'}, {'from': 'sleep', 'to': 'lie', 'clip': 'sleep_to_lie'},
            {'from': 'lie', 'to': 'lieBox', 'fade': 0.5}, {'from': 'lieBox', 'to': 'boxBelly', 'clip': 'box_enter'},
            {'from': 'boxBelly', 'to': 'lieBox', 'clip': 'box_exit'}, {'from': 'lieBox', 'to': 'lie', 'fade': 0.5},
            {'from': 'lie', 'to': 'liePillow', 'fade': 0.5}, {'from': 'liePillow', 'to': 'pillow', 'clip': 'pillow_enter'},
            {'from': 'pillow', 'to': 'liePillow', 'clip': 'pillow_exit'}, {'from': 'liePillow', 'to': 'lie', 'fade': 0.5},
        ],
        'lines': {
            'greet': ['……喵。'],
            'click': {
                'default': ['……', '嗯。', '喵。', '（慢慢眨眼）'],
                'sit': ['……', '嗯？', '（歪頭）'],
                'sleep': ['……zzz', '（耳朵動了一下）', '……（不為所動）'],
                'boxBelly': ['……zzz', '（耳朵動了一下）', '……（不為所動）'],
            },
            'drag': ['……隨便你', '（液態貓）'],
            'noDrag': ['……（不想動）'],
            'command': {'lie': '……嗯。', 'sit': '……好啦。', 'sleep': '呼啊——', 'boxBelly': '（盯——紙箱）', 'pillow': '（看了抱枕一眼）'},
            'reminders': {
                'water': {'default': '……該喝水了。', 'sleep': '……（睡夢中）去喝水。', 'boxBelly': '……（睡夢中）去喝水。'},
                'stretch': {'default': '……起來動一動。', 'sleep': '……（睡夢中）起來動一動。', 'boxBelly': '……（睡夢中）起來動一動。'},
                'eyes': {'default': '……眼睛休息一下。', 'sleep': '……（睡夢中）眼睛休息一下。', 'boxBelly': '……（睡夢中）眼睛休息一下。'},
            },
        },
        'clickHeart': True,
        'commands': [{'label': '趴著', 'pose': 'lie'}, {'label': '坐下', 'pose': 'sit'}, {'label': '睡覺', 'pose': 'sleep'},
                     {'label': '紙箱翻肚', 'pose': 'boxBelly'}, {'label': '藍色抱枕', 'pose': 'pillow'}],
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default='C:/Users/USER/pet-ai-spike/work/xz/final')
    ap.add_argument('--out', default='packs/xiaozhao')
    args = ap.parse_args()
    src, out = Path(args.src), Path(args.out)
    missing = [f'clips/{c}.mp4' for c in CLIPS if not (src / 'clips' / f'{c}.mp4').exists()] + \
              [s for s in STILLS.values() if not (src / s).exists()]
    if missing:
        print('缺少這些素材，先把它們做好再轉換：', *missing, sep='\n  ')
        return 1
    (out / 'clips').mkdir(parents=True, exist_ok=True)
    for c in CLIPS:
        key_clip(src / 'clips' / f'{c}.mp4', out / 'clips' / f'{c}.webm')
        print('keyed', c)
    geo = {pose: geometry(src / f) for pose, f in STILLS.items()}
    portrait(src / 'lie.png', out / 'portrait.png')
    (out / 'pack.json').write_text(json.dumps(build_pack(geo), ensure_ascii=False, indent=1), encoding='utf-8')
    print('geometry', json.dumps(geo, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
