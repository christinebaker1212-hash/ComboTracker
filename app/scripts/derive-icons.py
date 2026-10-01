"""Makes icons that were missing or wrong by deriving them from existing art.

Run from anywhere:  python3 app/scripts/derive-icons.py   (needs Pillow)

- Left shoulder/trigger icons for the controller styles (Xbox LB/LT,
  PlayStation L1/L2, Nintendo L/ZL), made by mirroring the right-hand art and
  re-lettering it. These styles use them for Any P / Any K, matching the
  default controller mapping (LB = Any P, LT = Any K).
- Xbox HK as RT: the old icon said LT, but HK comes from RT on the controller.
- Held Any P / Any K in the default style: the two icons were the same picture,
  so a held punch and a held kick couldn't be told apart.
- Charge-up in the PC style: it was the plain "W" key instead of the light
  "held" key the other charge directions use.
"""
from collections import deque
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont

ICONS = Path(__file__).resolve().parents[2] / 'icons'
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'


def load(name):
    for p in ICONS.iterdir():
        if p.stem.lower() == name.lower() and p.suffix.lower() == '.png':
            return Image.open(p).convert('RGBA')
    raise FileNotFoundError(name)


def save(img, name):
    # Replace any existing file regardless of letter case.
    for p in ICONS.iterdir():
        if p.stem.lower() == name.lower() and p.suffix.lower() == '.png':
            p.unlink()
    img.save(ICONS / f'{name}.png')
    print('wrote', name)


def lum(px):
    r, g, b, a = px
    return (0.3 * r + 0.59 * g + 0.11 * b) * a / 255


def text_mask(img):
    """Bright (or brightly coloured) pixels not connected to the image edge: the button's letters."""
    w, h = img.size
    px = img.load()

    def bright(x, y):
        r, g, b, a = px[x, y]
        return a > 128 and (lum(px[x, y]) > 110 or max(r, g, b) - min(r, g, b) > 90 and max(r, g, b) > 150)

    # The outline is bright too; flood it from the edge-most bright pixels so it's kept.
    seen = [[False] * h for _ in range(w)]
    comps = []
    for sx in range(w):
        for sy in range(h):
            if seen[sx][sy] or not bright(sx, sy):
                continue
            q, comp = deque([(sx, sy)]), []
            seen[sx][sy] = True
            while q:
                x, y = q.popleft()
                comp.append((x, y))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and not seen[nx][ny] and bright(nx, ny):
                        seen[nx][ny] = True
                        q.append((nx, ny))
            comps.append(comp)
    outline = max(comps, key=len)
    letters = [p for c in comps if c is not outline and len(c) > 3 for p in c]
    return letters


def relabel(src, text, mirror=True):
    img = src.transpose(Image.FLIP_LEFT_RIGHT) if mirror else src.copy()
    letters = text_mask(img)
    xs, ys = [p[0] for p in letters], [p[1] for p in letters]
    box = (min(xs), min(ys), max(xs), max(ys))
    colour = tuple(sorted((img.getpixel(p) for p in letters), key=lum)[len(letters) * 3 // 4][:3])
    # Paint the old letters out with the button's face colour from around them.
    px = img.load()
    letter_set = set(letters)
    pad = 3
    ring = [px[x, y] for x in range(box[0] - pad, box[2] + pad + 1) for y in range(box[1] - pad, box[3] + pad + 1)
            if (x, y) not in letter_set and 0 <= x < img.width and 0 <= y < img.height and lum(px[x, y]) < 80 and px[x, y][3] > 200]
    face = tuple(sorted(ring, key=lum)[len(ring) // 2])
    d = ImageDraw.Draw(img)
    d.rectangle((box[0] - 1, box[1] - 1, box[2] + 1, box[3] + 1), fill=face)
    # Draw the new letters at 4x, slightly condensed, matching the old cap height.
    cap = box[3] - box[1] + 1
    scale = 4
    font = ImageFont.truetype(FONT, int(cap * scale * 1.27))
    tb = font.getbbox(text)
    layer = Image.new('RGBA', (tb[2] - tb[0] + 8, tb[3] - tb[1] + 8), (0, 0, 0, 0))
    ImageDraw.Draw(layer).text((4 - tb[0], 4 - tb[1]), text, font=font, fill=colour + (255,))
    layer = layer.crop(layer.getbbox())
    tw = max(1, round(layer.width / scale * 0.8))
    th = max(1, round(layer.height / scale))
    layer = layer.resize((tw, th), Image.LANCZOS)
    cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    img.alpha_composite(layer, (round(cx - tw / 2), round(cy - th / 2)))
    return img


def with_hold_badge(base, badge):
    """A button icon with the default 'hold' picture tucked in its corner."""
    img = base.copy()
    b = badge.resize((img.width // 2, round(badge.height * (img.width // 2) / badge.width)), Image.LANCZOS)
    img.alpha_composite(b, (img.width - b.width, img.height - b.height))
    return img


def charge_key(dark_plain, light_template):
    """PC style: turn a dark key into the light 'held' version, using another held key as the frame."""
    letter = ImageChops.invert(dark_plain.convert('RGB'))
    out = light_template.copy()
    inner = (14, 14, out.width - 14, out.height - 14)
    out.paste(letter.crop(inner), inner[:2])
    return out


if __name__ == '__main__':
    xb_rb, xb_lt = load('hp_xb'), load('hk_xb')
    if not (ICONS / 'any_k_xb.png').exists():
        save(xb_lt, 'any_k_xb')                       # LT, before HK is replaced
    save(relabel(xb_rb, 'LB'), 'any_p_xb')
    save(relabel(load('any_k_xb'), 'RT'), 'hk_xb')
    save(relabel(load('hp_ps'), 'L1'), 'any_p_ps')
    save(relabel(load('hk_ps'), 'L2'), 'any_k_ps')
    save(relabel(load('hp_nt'), 'L'), 'any_p_nt')
    save(relabel(load('hk_nt'), 'ZL'), 'any_k_nt')

    badge = load('h_any_p')
    if not (ICONS / 'hold_badge.png').exists():
        save(badge, 'hold_badge')
    badge = load('hold_badge')
    save(with_hold_badge(load('any_p'), badge), 'h_any_p')
    save(with_hold_badge(load('any_k'), badge), 'h_any_k')

    save(charge_key(load('up_kb'), load('c_down_kb')), 'c_up_kb')
