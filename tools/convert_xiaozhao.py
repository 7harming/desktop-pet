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
         'box_enter', 'box_idle', 'box_exit', 'pillow_enter', 'pillow_idle', 'pillow_exit', 'walk_loop', 'walk_arrive', 'walk_depart',
         'bowl_enter', 'bowl_idle', 'bowl_exit', 'stretch_enter', 'stretch_hold', 'stretch_exit', 'pounce_left', 'pounce_right']
# drinking (spike steps 32-35): the bowl fades in beside the lying cat; it walks over, drinks (a seamless loop), walks back
# stretching (spike steps 36-39): gets up, stretches side-on, holds it (a back-and-forth loop), lies down again
# pouncing (spike steps 40-41): double-clicked while lying, she pounces to that side and lies down again in her spot
POUNCES = ['pounce_left', 'pounce_right']
STILLS = {'lie': 'lie.png', 'sit': 'sit.png', 'sleep': 'sleep.png', 'boxBelly': 'end_box.png', 'pillow': 'end_pillow.png',
          'drink': 'end_bowl.png', 'stretch': 'end_stretch.png'}
# walking (spike steps 42-46): the loop is one stride cycle cut from a strictly side-on Veo tracking walk, at 60 fps
# (walk_loop_start is its first frame); arrive / depart are Veo clips joined to it, already cut to length in the spike
WALK_STILLS = {'start': 'walk_loop_start.png', 'left': 'walk_left2.png'}
WALK_SPEED = 9.86 * 24 / 1280   # the loop's planted paws slide back 9.86 px a frame (xz45): frame widths per second
TRIM = {}                       # frames cut from the start of a clip
FPS = {'walk_loop': 60}         # the loop is built at 60 fps; the rest stay at 24
RAMP = 12                       # frames over which arrive / depart ease into and out of the loop's pace
HD_SIZE = '1920:1080'           # the break's big cat: clips upscaled 2x by Topaz (spike step 28), keyed at this size
FEATHER = 12 / 960              # side-on, the tail can sweep past the frame's left or top edge (nothing is drawn beyond it):
                                # fade the frame's top, left and right edges over this share of its width so it tapers off
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
    return {'ground': round(GROUND, 3), 'centerX': round(float(xs.min() + xs.max()) / 2 / w, 3), 'head': round(GROUND - ys.min() / h, 3),
            'left': round(float(xs.min()) / w, 3), 'right': round(float(xs.max()) / w, 3)}


def eased_glide(track: list, at_start: bool) -> list:
    """A glide track (cumulative, per frame) whose speed eases to the loop's over RAMP frames at the end that joins the loop."""
    g = np.array(track, float)
    v = np.diff(np.concatenate([[0.0], g]))
    loop_v = WALK_SPEED / 24 * np.sign(g[-1])
    n = min(RAMP, len(v))
    t = np.linspace(0, 1, n)
    if at_start: v[:n] = loop_v * (1 - t) + v[:n] * t
    else: v[-n:] = v[-n:] * (1 - t) + loop_v * t
    return [round(float(x), 4) for x in np.cumsum(v)]


def walk_section(src: Path, lie: dict) -> dict:
    g = {k: geometry(src / f) for k, f in WALK_STILLS.items()}
    glide = json.loads((src / 'clips' / 'glide.json').read_text())     # xz26, measured from the planted paws
    return {'loop': 'walk_loop', 'centerX': g['start']['centerX'], 'speed': round(WALK_SPEED, 4),
            'arrive': 'walk_arrive', 'depart': 'walk_depart', 'departX': g['left']['centerX'],
            'width': round(g['start']['right'] - g['start']['left'], 3), 'head': g['start']['head'],
            # arrive and depart end / start at the resting spot: they reach from the walking stills to the lying cat
            'left': min(g['start']['left'], g['left']['left'], lie['left']), 'right': max(g['start']['right'], g['left']['right'], lie['right']),
            'rate': 1, 'arriveGlide': eased_glide(glide['arrive'], True), 'departGlide': eased_glide(glide['depart'], False)}


def clip_extent(mp4s: list) -> tuple:
    """Left and right edge of everything the clips draw over all their frames, as shares of the frame width."""
    xs = []
    for mp4 in mp4s:
        raw = subprocess.run([FF, '-v', 'error', '-i', str(mp4), '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '320x180', '-'],
                             capture_output=True, check=True).stdout
        fr = np.frombuffer(raw, np.uint8).reshape(-1, 180, 320, 3).astype(np.float32)
        bg = np.concatenate([fr[0, :4, :4].reshape(-1, 3), fr[0, :4, -4:].reshape(-1, 3)]).mean(0)
        cols = np.nonzero((np.linalg.norm(fr - bg, axis=3) > 70).any(axis=(0, 1)))[0]
        xs += [cols.min(), cols.max() + 1]
    return round(float(min(xs)) / 320, 3), round(float(max(xs)) / 320, 3)


def bg_colour(src: Path) -> str:
    raw = subprocess.run([FF, '-v', 'error', '-i', str(src), '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '64x36', '-'],
                         capture_output=True, check=True).stdout
    f = np.frombuffer(raw, np.uint8).reshape(36, 64, 3)
    bg = np.concatenate([f[:3, :3].reshape(-1, 3), f[:3, -3:].reshape(-1, 3)]).mean(0)
    return '0x%02X%02X%02X' % tuple(int(round(c)) for c in bg)


def key_filter(src: Path, choke: int = 1) -> str:
    """Key out the green stage. The soft edge keeps a little green, which despill turns olive-brown; choking the alpha by
    `choke` px (1 at the pet's size, 2 for the break's big copies) drops that rim."""
    keyed = f'format=rgba,chromakey={bg_colour(src)}:0.14:0.06,despill=type=green:mix=0.6:expand=0.1'
    if not choke:
        return keyed
    return f'{keyed},split[c][a];[a]alphaextract{",erosion" * choke}[m];[c][m]alphamerge'


def edge_feather(px: int) -> str:
    """Fade the alpha to nothing at the frame's top, left and right edges, over `px` pixels (the ground edge is left alone)."""
    return f"format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*clip(min(min(X,W-1-X),Y)/{px},0,1)'"


def key_clip(src: Path, dst: Path, trim: int = 0, size: str = '960:540', choke: int = 1, fps: int = 24) -> None:
    vf = f'scale={size},{key_filter(src, choke)},{edge_feather(round(FEATHER * int(size.split(":")[0])))}'
    cut = ['-ss', f'{trim / 24:.4f}'] if trim else []
    subprocess.run([FF, '-y', '-loglevel', 'error', *cut, '-i', str(src), '-vf', vf, '-r', str(fps), '-c:v', 'libvpx-vp9',
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


def build_pack(geo: dict, walk: dict, pounce: tuple) -> dict:
    lie = geo['lie']
    return {
        'schemaVersion': 1, 'id': 'xiaozhao', 'order': 1, 'name': '小昭', 'personality': '淡定、愛翻肚、最愛紙箱', 'portrait': 'portrait.png',
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
            'lieBowl': {'label': '（水碗出現）', 'transient': True, **lie, 'shadow': True},
            # at the water reminder, now and then by itself, or when told: at least one drinking loop, then back
            'drink': {'label': '喝水', 'idle': ['bowl_idle'], **geo['drink'], 'shadow': False, 'draggable': False, 'brief': True, 'stay': 0.5, 'autoWeight': 0.3},
            # at the stretch reminder, now and then by itself, or when told: one hold, then back to what it was doing
            'stretch': {'label': '伸懶腰', 'idle': ['stretch_hold'], **geo['stretch'], 'shadow': True, 'draggable': False, 'brief': True, 'stay': 0, 'autoWeight': 0.3},
        },
        'clips': {c: {'file': f'clips/{c}.webm', **({'rate': 0.8} if c in ('box_exit', 'pillow_enter') else {})} for c in CLIPS},
        'edges': [
            {'from': 'lie', 'to': 'sit', 'clip': 'lie_to_sit'}, {'from': 'sit', 'to': 'lie', 'clip': 'sit_to_lie'},
            {'from': 'lie', 'to': 'sleep', 'clip': 'lie_to_sleep'}, {'from': 'sleep', 'to': 'lie', 'clip': 'sleep_to_lie'},
            {'from': 'lie', 'to': 'lieBox', 'fade': 0.5}, {'from': 'lieBox', 'to': 'boxBelly', 'clip': 'box_enter'},
            {'from': 'boxBelly', 'to': 'lieBox', 'clip': 'box_exit'}, {'from': 'lieBox', 'to': 'lie', 'fade': 0.5},
            {'from': 'lie', 'to': 'liePillow', 'fade': 0.5}, {'from': 'liePillow', 'to': 'pillow', 'clip': 'pillow_enter'},
            {'from': 'pillow', 'to': 'liePillow', 'clip': 'pillow_exit'}, {'from': 'liePillow', 'to': 'lie', 'fade': 0.5},
            {'from': 'lie', 'to': 'lieBowl', 'fade': 0.5}, {'from': 'lieBowl', 'to': 'drink', 'clip': 'bowl_enter'},
            {'from': 'drink', 'to': 'lieBowl', 'clip': 'bowl_exit'}, {'from': 'lieBowl', 'to': 'lie', 'fade': 0.5},
            {'from': 'lie', 'to': 'stretch', 'clip': 'stretch_enter'}, {'from': 'stretch', 'to': 'lie', 'clip': 'stretch_exit'},
        ],
        'lines': {
            'greet': ['……喵。'],
            'click': {
                'default': ['……', '嗯。', '喵。', '（慢慢眨眼）'],
                'sit': ['……', '嗯？', '（歪頭）'],
                'sleep': ['……zzz', '（耳朵動了一下）', '……（不為所動）'],
                'boxBelly': ['……zzz', '（耳朵動了一下）', '……（不為所動）'],
                'drink': ['（咕嚕咕嚕）', '……（專心喝水）', '（舔舔）'],
                'stretch': ['（伸——）', '……（伸懶腰中）'],
            },
            'drag': ['……隨便你', '（液態貓）'],
            'noDrag': ['……（不想動）'],
            'command': {'lie': '……嗯。', 'sit': '……好啦。', 'sleep': '呼啊——', 'boxBelly': '（盯——紙箱）', 'pillow': '（看了抱枕一眼）', 'stretch': '……伸一下。', 'drink': '……去喝口水。'},
            'reminders': {
                'water': {'default': '……該喝水了。', 'drink': '……你也喝一點。', 'sleep': '……（睡夢中）去喝水。', 'boxBelly': '……（睡夢中）去喝水。'},
                'stretch': {'default': '……起來動一動。', 'stretch': '……一起伸個懶腰。', 'sleep': '……（睡夢中）起來動一動。', 'boxBelly': '……（睡夢中）起來動一動。'},
                'eyes': {'default': '……眼睛休息一下。', 'sleep': '……（睡夢中）眼睛休息一下。', 'boxBelly': '……（睡夢中）眼睛休息一下。'},
            },
        },
        'clickHeart': True,
        'commands': [{'label': '趴著', 'pose': 'lie'}, {'label': '坐下', 'pose': 'sit'}, {'label': '睡覺', 'pose': 'sleep'},
                     {'label': '紙箱翻肚', 'pose': 'boxBelly'}, {'label': '藍色抱枕', 'pose': 'pillow'}, {'label': '伸懶腰', 'pose': 'stretch'},
                     {'label': '喝水', 'pose': 'drink'}, {'label': '向左撲', 'pounce': 'left'}, {'label': '向右撲', 'pounce': 'right'}],
        'walk': walk,
        'reminderPoses': {'water': 'drink', 'stretch': 'stretch'},
        'pounce': {'pose': 'lie', 'toLeft': 'pounce_left', 'toRight': 'pounce_right', 'left': pounce[0], 'right': pounce[1],
                   'autoChance': 0.08},
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default='C:/Users/USER/pet-ai-spike/work/xz/final')
    ap.add_argument('--out', default='packs/xiaozhao')
    args = ap.parse_args()
    src, out = Path(args.src), Path(args.out)
    missing = [f'clips/{c}.mp4' for c in CLIPS if not (src / 'clips' / f'{c}.mp4').exists()] + \
              [s for s in [*STILLS.values(), *WALK_STILLS.values()] if not (src / s).exists()]
    if missing:
        print('缺少這些素材，先把它們做好再轉換：', *missing, sep='\n  ')
        return 1
    (out / 'clips').mkdir(parents=True, exist_ok=True)
    for c in CLIPS:
        mp4, webm = src / 'clips' / f'{c}.mp4', out / 'clips' / f'{c}.webm'
        if webm.exists() and webm.stat().st_mtime >= mp4.stat().st_mtime:
            continue                     # already keyed from this version of the clip
        key_clip(mp4, webm, TRIM.get(c, 0), fps=FPS.get(c, 24))
        print('keyed', c)
    geo = {pose: geometry(src / f) for pose, f in STILLS.items()}
    portrait(src / 'lie.png', out / 'portrait.png')
    hd = {}
    for mp4 in sorted((src / 'clips' / 'hd').glob('*.mp4')):
        c = mp4.stem
        webm = out / 'hd' / f'{c}.webm'
        if c not in CLIPS:
            continue
        if not (webm.exists() and webm.stat().st_mtime >= mp4.stat().st_mtime):
            webm.parent.mkdir(exist_ok=True)
            key_clip(mp4, webm, TRIM.get(c, 0), HD_SIZE, choke=2, fps=FPS.get(c, 24))
            print('keyed hd', c)
        hd[c] = f'hd/{c}.webm'
    walk = walk_section(src, geo['lie'])
    pounce = clip_extent([src / 'clips' / f'{c}.mp4' for c in POUNCES])
    pack = build_pack(geo, walk, pounce)
    if hd:
        pack['hd'] = hd
    (out / 'pack.json').write_text(json.dumps(pack, ensure_ascii=False, indent=1), encoding='utf-8')
    print('geometry', json.dumps(geo, ensure_ascii=False))
    print('walk', json.dumps(walk, ensure_ascii=False))
    print('pounce reaches', pounce)
    return 0


if __name__ == '__main__':
    sys.exit(main())
