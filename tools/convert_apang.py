"""Convert 阿胖's approved clips from the feasibility spike into a desktop-pet pack (the second cat, 2026-09-29).

The spike puts everything this needs in work/af/final/pack (its step af32_pack_prep.py). Run with the spike's Python:
  C:/Users/USER/pet-ai-spike/.venv/Scripts/python.exe tools/convert_apang.py

Like 小昭's pack (convert_xiaozhao.py, whose keying and measuring this reuses), with three differences:
  - resting lying down is the loaf (paws tucked); the lying pose with the paws out is only passed through (stay 0, never a target)
    - every other clip starts or ends there
  - kneading, the paw-lick face wash and the lip-lick are single clips from a pose back to it: each is a brief pose whose idle is
    that clip, reached from its pose by a fade as short as the usual cross-fade (the clip starts on that pose's own frame)
  - his two sides differ, so walking left is his own loop (walk.leftward), not the right one mirrored
"""
import argparse
import io
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

from convert_xiaozhao import FF, HD_SIZE, SWATS, clip_extent, geometry, key_clip, key_filter, toy_section

CLIPS = ['idle_lie', 'lie_to_sit', 'idle_sit', 'sit_to_lie', 'lick', 'knead_lie', 'lickpaw', 'lie_to_sleep', 'idle_sleep',
         'sleep_to_lie', 'lie_to_side', 'idle_side', 'side_to_lie', 'lie_to_loaf', 'idle_loaf', 'loaf_to_lie',
         'walk_loop', 'walk_left_loop', 'walk_arrive', 'walk_depart', 'fight_left', 'fight_right']
# play-fighting (spike fight1-6, 2026-09-29): with 小昭 close by he gets up, arches his back facing her, sits and swats, lies down
FIGHTS = ['fight_left', 'fight_right']
# the cat wand (spike wand1-2, 2026-10-01); his sitting, swats included, is 6% bigger than it was made (spike af35)
CLIPS += list(SWATS.values())
FPS = {'walk_loop': 60, 'walk_left_loop': 60}   # the loops are built at 60 fps (Topaz); the rest stay at 24
STILLS = {'lie': 'lie.png', 'loaf': 'loaf.png', 'sit': 'sit.png', 'sleep': 'sleep.png', 'side': 'side.png'}
WALK_STILLS = {'right': 'walk_right_loop_start.png', 'left': 'walk_left_loop_start.png'}
# brief poses that are one clip from a pose back to it: (the pose they start and end in, their clip)
ACTIONS = {'knead': ('lie', 'knead_lie'), 'lickpaw': ('lie', 'lickpaw'), 'lick': ('sit', 'lick')}
FACE = 3.6                      # the portrait's width in eye distances
JOIN_FADE = 0.12               # seconds; the player's own cross-fade between clips (src/pet/player.ts CROSSFADE_S)
RAMP = 12                       # frames over which arrive / depart ease into and out of the loop's pace


def speed(px_per_frame: float) -> float:
    """How fast a loop's planted paws slide back (px per 24 fps frame at 1280 wide), in frame widths per second."""
    return round(px_per_frame * 24 / 1280, 4)


def eased_glide(track: list, at_start: bool, loop_speed: float) -> list:
    """A glide track (cumulative, per frame) whose speed eases to its loop's over RAMP frames at the end that joins that loop."""
    g = np.array(track, float)
    v = np.diff(np.concatenate([[0.0], g]))
    loop_v = loop_speed / 24 * np.sign(g[-1])
    n = min(RAMP, len(v))
    t = np.linspace(0, 1, n)
    if at_start: v[:n] = loop_v * (1 - t) + v[:n] * t
    else: v[-n:] = v[-n:] * (1 - t) + loop_v * t
    return [round(float(x), 4) for x in np.cumsum(v)]


def portrait(still: Path, dst: Path) -> None:
    """The face, filling the panel's round avatar. 小昭's portrait centres on the cat's highest band, but lying loafed 阿胖's back
    rises about as high as his ears, which pulled that crop onto his back. So: centred between the amber eyes, a little below them
    (the nose) and a little right of them, FACE eye-distances across - the whole face inside the circle, only the ear tips may reach past it (owner:
    bigger, centred, the face not cut)."""
    png = subprocess.run([FF, '-v', 'error', '-i', str(still), '-vf', key_filter(still), '-f', 'image2pipe', '-vcodec', 'png', '-'],
                         capture_output=True, check=True).stdout
    img = Image.open(io.BytesIO(png)).convert('RGBA')
    a = np.asarray(img).astype(np.int16)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    amber = (al > 128) & (r > 150) & (g > 70) & (g < 200) & (b < 110) & (r - b > 90) & (r - g > 25)
    # a relaxed eye's amber can come in two pieces either side of the pupil: join near pieces first, then take the two biggest
    # blobs that are well apart
    lab, n = ndimage.label(ndimage.binary_dilation(ndimage.binary_opening(amber), iterations=4))
    blobs = sorted(((lab == i).sum(), i, np.nonzero(lab == i)[1].mean()) for i in range(1, n + 1))[::-1]
    first = blobs[0]
    second = next(b for b in blobs[1:] if abs(b[2] - first[2]) > 30)
    eyes = [first[:2], second[:2]]
    centres = [first[2], second[2]]
    ys, xs = np.nonzero(np.isin(lab, [i for _, i in eyes]))
    cx, cy = xs.mean(), ys.mean()
    eye_gap = abs(centres[0] - centres[1])
    size = FACE * eye_gap
    cy += 0.3 * eye_gap
    cx += 0.12 * eye_gap                  # loafed he looks a little to the left: his face reaches further right
    box = (int(cx - size / 2), int(cy - size / 2), int(cx + size / 2), int(cy + size / 2))
    # resize premultiplied, so the transparent stage colour does not bleed into the edge
    img.convert('RGBa').crop(box).resize((256, 256), Image.LANCZOS).convert('RGBA').save(dst)


def walk_section(src: Path, lie: dict) -> dict:
    g = {k: geometry(src / f) for k, f in WALK_STILLS.items()}
    glide = json.loads((src / 'glide.json').read_text())
    px = json.loads((src / 'speeds.json').read_text())
    right, left = speed(px['walk_loop']), speed(px['walk_left_loop'])
    return {'loop': 'walk_loop', 'centerX': g['right']['centerX'], 'speed': right,
            'arrive': 'walk_arrive', 'depart': 'walk_depart', 'departX': g['left']['centerX'],
            'width': round(g['right']['right'] - g['right']['left'], 3), 'head': g['right']['head'],
            # arrive and depart end / start at the resting spot: they reach from the walking stills to the lying cat
            'left': min(g['right']['left'], g['left']['left'], lie['left']), 'right': max(g['right']['right'], g['left']['right'], lie['right']),
            'rate': 1, 'arriveGlide': eased_glide(glide['arrive'], True, right), 'departGlide': eased_glide(glide['depart'], False, left),
            'leftward': {'loop': 'walk_left_loop', 'centerX': g['left']['centerX'],
                         'width': round(g['left']['right'] - g['left']['left'], 3), 'speed': left}}


def build_pack(geo: dict, walk: dict, fight: tuple, toy: dict) -> dict:
    fade = lambda a, b: {'from': a, 'to': b, 'fade': JOIN_FADE}
    return {
        'schemaVersion': 1, 'id': 'apang', 'order': 2, 'name': '阿胖', 'personality': '膽小但很親人、喜歡撒嬌', 'portrait': 'portrait.png',
        # 5.4 kg to 小昭's 4.7 (owner): he is drawn 5% bigger than her (about the cube root of their weights)
        'frame': {'aspect': round(16 / 9, 4), 'displayHeight': round(440 * 1.05)},
        'start': 'lie',
        'poses': {
            # the paws-out lying pose: where walking in ends and every other clip meets; never a rest of its own
            'lie': {'label': '趴著', 'idle': ['idle_lie'], **geo['lie'], 'shadow': True, 'draggable': True, 'stay': 0, 'autoWeight': 0},
            'loaf': {'label': '母雞蹲', 'idle': ['idle_loaf'], **geo['loaf'], 'shadow': True, 'draggable': True, 'stay': 0.8, 'autoWeight': 1.5},
            'sit': {'label': '坐著', 'idle': ['idle_sit'], **geo['sit'], 'shadow': True, 'draggable': False, 'stay': 0.6, 'autoWeight': 0.6},
            'sleep': {'label': '睡覺', 'idle': ['idle_sleep'], **geo['sleep'], 'shadow': True, 'draggable': False, 'asleep': True, 'stay': 0.85, 'autoWeight': 0.8},
            'side': {'label': '側躺', 'idle': ['idle_side'], **geo['side'], 'shadow': True, 'draggable': False, 'asleep': True, 'stay': 0.8, 'autoWeight': 0.8},
            'knead': {'label': '踏踏', 'idle': ['knead_lie'], **geo['knead'], 'shadow': True, 'draggable': False, 'brief': True, 'stay': 0, 'autoWeight': 0.3},
            'lickpaw': {'label': '洗臉', 'idle': ['lickpaw'], **geo['lickpaw'], 'shadow': True, 'draggable': False, 'brief': True, 'stay': 0, 'autoWeight': 0.3},
            'lick': {'label': '舔嘴巴', 'idle': ['lick'], **geo['lick'], 'shadow': True, 'draggable': False, 'brief': True, 'stay': 0, 'autoWeight': 0.3},
            # the stretch reminder (he has no stretch of his own, owner 2026-09-29): he rolls onto his side, stretched out, then
            # back - the side pose's clips, as a brief visit that is never picked or ticked by itself
            'sideStretch': {'label': '伸展', 'idle': ['idle_side'], **geo['side'], 'shadow': True, 'draggable': False, 'brief': True, 'stay': 0, 'autoWeight': 0},
        },
        'clips': {c: {'file': f'clips/{c}.webm'} for c in CLIPS},
        'edges': [
            {'from': 'lie', 'to': 'loaf', 'clip': 'lie_to_loaf'}, {'from': 'loaf', 'to': 'lie', 'clip': 'loaf_to_lie'},
            {'from': 'lie', 'to': 'sit', 'clip': 'lie_to_sit'}, {'from': 'sit', 'to': 'lie', 'clip': 'sit_to_lie'},
            {'from': 'lie', 'to': 'sleep', 'clip': 'lie_to_sleep'}, {'from': 'sleep', 'to': 'lie', 'clip': 'sleep_to_lie'},
            {'from': 'lie', 'to': 'side', 'clip': 'lie_to_side'}, {'from': 'side', 'to': 'lie', 'clip': 'side_to_lie'},
            {'from': 'lie', 'to': 'sideStretch', 'clip': 'lie_to_side'}, {'from': 'sideStretch', 'to': 'lie', 'clip': 'side_to_lie'},
            *[e for pose, (base, _) in ACTIONS.items() for e in (fade(base, pose), fade(pose, base))],
        ],
        'lines': {
            'greet': ['喵～', '（探頭）……喵？'],
            'click': {
                'default': ['喵～', '（蹭蹭）', '呼嚕呼嚕……', '（眨眼撒嬌）'],
                'loaf': ['（揣手手）', '呼嚕……', '喵～'],
                'sit': ['喵？', '（歪頭）', '（盯——）'],
                'sleep': ['……zzz', '（耳朵抖了一下）', '……（睡得很熟）'],
                'side': ['……zzz', '（肚子一起一伏）', '（伸了個懶腰）'],
                'knead': ['（踩踩踩）', '呼嚕呼嚕……'],
                'lickpaw': ['（舔舔）', '（洗臉中）'],
                'lick': ['（舔舔嘴）', '好吃～'],
                'sideStretch': ['（伸——）', '（伸展中）'],
            },
            'drag': ['喵！（嚇一跳）', '（縮成一團）'],
            'noDrag': ['……（不想動）', '（抱緊地板）'],
            'command': {'loaf': '（揣手手）', 'sit': '喵～好。', 'sleep': '呼啊——', 'side': '（翻身躺平）', 'knead': '（踩踩～）',
                        'lickpaw': '洗個臉。', 'lick': '（舔舔嘴）'},
            'reminders': {
                'water': {'default': '喵～該喝水了。', 'lick': '（舔舔嘴）喵～你也喝點水。', 'sleep': '……（睡夢中）去喝水。', 'side': '……（睡夢中）去喝水。'},
                'stretch': {'default': '喵～起來動一動。', 'sideStretch': '喵～一起伸展一下。', 'sleep': '……（睡夢中）起來動一動。', 'side': '……（睡夢中）起來動一動。'},
                'eyes': {'default': '喵～眼睛休息一下。', 'sleep': '……（睡夢中）眼睛休息一下。', 'side': '……（睡夢中）眼睛休息一下。'},
            },
            'fight': ['喵嗚～', '（躲到一邊舔舔毛）', '喵！（我贏了）'],
            # back at the computer, and the clock (2026-10-01)
            'back': ['喵～你回來了！', '（揉揉眼睛）喵～回來了？', '（伸懶腰）喵～'],
            'time': {
                'morning': ['喵～早安！', '（揉揉眼睛）喵～早。'],
                'weekend': ['喵？假日還在工作？', '喵～今天放假耶。'],
                'lunch': ['喵～該吃飯了！', '（肚子咕嚕咕嚕）喵～吃飯時間。'],
                'offWork': ['喵～還不下班嗎？', '喵～六點了，回家吧。'],
                'friday': ['喵～週末快到了！', '喵～再撐一下就週末了。'],
                'bedtime': ['喵～該睡了。', '（打哈欠）喵～好晚了。', '喵～去睡覺啦。'],
            },
            # the dinner wheel stopped over him (小昭 not out) (2026-10-17; the owner approved these)
            'dinner': ['今晚吃{dish}好不好～', '阿胖覺得{dish}！'],
        },
        'clickHeart': True,
        'commands': [{'label': '母雞蹲', 'pose': 'loaf'}, {'label': '坐下', 'pose': 'sit'}, {'label': '睡覺', 'pose': 'sleep'},
                     {'label': '側躺', 'pose': 'side'}, {'label': '踏踏', 'pose': 'knead'}, {'label': '洗臉', 'pose': 'lickpaw'},
                     {'label': '舔嘴巴', 'pose': 'lick'}],
        'walk': walk,
        'reminderPoses': {'water': 'lick', 'stretch': 'sideStretch'},
        'fight': {'pose': 'lie', 'toLeft': 'fight_left', 'toRight': 'fight_right', 'left': fight[0], 'right': fight[1]},
        'alert': 'sit',          # he sits up to look at the user (back at the computer, a reminder due)
        'card': 'memo',          # he holds the memo
        'toy': toy,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default='C:/Users/USER/pet-ai-spike/work/af/final/pack')
    ap.add_argument('--out', default='packs/apang')
    args = ap.parse_args()
    src, out = Path(args.src), Path(args.out)
    needed = [*[f'clips/{c}.mp4' for c in CLIPS], *STILLS.values(), *WALK_STILLS.values(), 'glide.json', 'speeds.json']
    missing = [f for f in needed if not (src / f).exists()]
    if missing:
        print('缺少這些素材，先在 spike 跑 af32_pack_prep.py：', *missing, sep='\n  ')
        return 1
    (out / 'clips').mkdir(parents=True, exist_ok=True)
    for c in CLIPS:
        mp4, webm = src / 'clips' / f'{c}.mp4', out / 'clips' / f'{c}.webm'
        if webm.exists() and webm.stat().st_mtime >= mp4.stat().st_mtime:
            continue                     # already keyed from this version of the clip
        key_clip(mp4, webm, fps=FPS.get(c, 24))
        print('keyed', c, flush=True)
    geo = {pose: geometry(src / f) for pose, f in STILLS.items()}
    # a brief action is drawn where its pose is, but its clip may reach further (a paw pushed forward)
    for pose, (base, clip) in ACTIONS.items():
        left, right = clip_extent([src / 'clips' / f'{clip}.mp4'])
        geo[pose] = {**geo[base], 'left': min(left, geo[base]['left']), 'right': max(right, geo[base]['right'])}
    portrait(src / 'loaf.png', out / 'portrait.png')
    hd = {}
    for mp4 in sorted((src / 'hd').glob('*.mp4')):
        c = mp4.stem
        if c not in CLIPS:
            continue
        webm = out / 'hd' / f'{c}.webm'
        if not (webm.exists() and webm.stat().st_mtime >= mp4.stat().st_mtime):
            webm.parent.mkdir(exist_ok=True)
            key_clip(mp4, webm, size=HD_SIZE, choke=2, fps=FPS.get(c, 24))
            print('keyed hd', c, flush=True)
        hd[c] = f'hd/{c}.webm'
    pack = build_pack(geo, walk_section(src, geo['lie']), clip_extent([src / 'clips' / f'{c}.mp4' for c in FIGHTS]),
                      toy_section(src / 'clips'))
    if hd:
        pack['hd'] = hd
    (out / 'pack.json').write_text(json.dumps(pack, ensure_ascii=False, indent=1), encoding='utf-8')
    print('geometry', json.dumps(geo, ensure_ascii=False))
    print('walk', json.dumps({k: v for k, v in pack['walk'].items() if 'Glide' not in k}, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
