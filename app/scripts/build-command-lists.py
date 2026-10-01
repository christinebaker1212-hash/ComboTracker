"""Builds command lists (Presets/Command Lists/<Game>/<Character>.json) from
FAT's frame data (https://github.com/D4RKONION/FAT, GPL-3.0): move names,
inputs, and each move's frame data (startup, active, recovery, on block, on
hit, and punish counter in SF6).

    git clone --depth 1 https://github.com/D4RKONION/FAT.git /tmp/FAT
    python scripts/build-command-lists.py /tmp/FAT

Moves are grouped into in-game style sections, light/medium/heavy versions are
merged into one entry, and notes from an existing list are kept when a move's
name matches.
"""
import json
import re
import sys
from collections import OrderedDict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "Presets" / "Command Lists"

GAMES = {
    "3S": ("Street Fighter III - Third Strike", "Default"),
    "SF6": ("Street Fighter 6", "Default"),
    "SFV": ("Street Fighter V", "Default"),
    "USF4": ("Ultra Street Fighter IV", "Default"),
}
# FAT's character names → this repo's file names, where they differ.
RENAME = {"A.K.I.": "AKI", "E.Honda": "E. Honda", "M.Bison": "M. Bison", "C.Viper": "C. Viper"}

NUMPAD = {"1": "downleft", "2": "down", "3": "downright", "4": "left", "6": "right",
          "7": "upleft", "8": "up", "9": "upright"}
FULL_CIRCLE = re.compile(r"^(4268|6248|41236987|63214789|412369|632147)")
BUTTON = re.compile(r"(LP|MP|HP|LK|MK|HK|PPP|KKK|PP|KK|P|K)")
BTN_TOKEN = {"LP": "lp", "MP": "mp", "HP": "hp", "LK": "lk", "MK": "mk", "HK": "hk",
             "P": "any_p", "K": "any_k", "PP": "any_p", "KK": "any_k", "PPP": "any_p", "KKK": "any_k"}
STRENGTH = re.compile(r"^(LP|MP|HP|LK|MK|HK|EX|OD|L|M|H|Light|Medium|Heavy)\s+")
SECTIONS = ["Special moves", "Super Arts", "Unique attacks", "Target combos", "Normal moves", "Throws", "System"]
FRAME_FIELDS = [("startup", "startup"), ("active", "active"), ("recovery", "recovery"),
                ("onBlock", "onBlock"), ("onHit", "onHit"), ("onPC", "onPC"), ("dmg", "damage")]


def parse_step(step):
    """'236HP' → tokens. Returns None if the step isn't understood."""
    s = step.strip()
    tokens = []
    if s.startswith("j."):
        tokens.append("up")
        s = s[2:]
    m = re.match(r"^\[(\d)\]", s)
    if m:
        tokens.append("c_" + NUMPAD[m.group(1)])
        s = s[m.end():]
    m = FULL_CIRCLE.match(s)
    while m:  # 720 motions are two full circles
        tokens.append("360")
        s = s[m.end():]
        m = FULL_CIRCLE.match(s) or re.match(r"^(4268|6248|2486|8624|2684|8426)", s)
    m = re.match(r"^(\d+)", s)
    if m:
        tokens += [NUMPAD[d] for d in m.group(1) if d in NUMPAD]
        s = s[m.end():]
    buttons = []
    while s:
        b = BUTTON.match(s)
        if not b:
            return None
        buttons.append(BTN_TOKEN[b.group(1)])
        s = s[b.end():]
    out = list(tokens)
    for i, b in enumerate(buttons):
        if out and (i > 0 or tokens):
            out.append("plus")
        out.append(b)
    return out or None


def parse_input(num_cmd):
    """Full input → (tokens, note). Parenthesised text becomes a note."""
    notes = re.findall(r"\(([^)]*)\)", num_cmd)
    core = re.sub(r"\([^)]*\)", "", num_cmd).strip()
    core = core.split(" or ")[0].split(" / ")[0].strip()
    core = re.sub(r"(\d)/(\d)", r"\2", core)            # "4/6LPLK": forward version
    core = re.sub(r"([A-Z]{1,2})/[A-Z]{1,2}\b", r"\1", core)  # "HP/HK": first button
    core = core.replace("+", "")
    # "SA3 > 236P": the super is chosen beforehand; note it instead.
    m = re.match(r"^(SA\d)\s*>\s*", core)
    if m:
        notes.append(f"during {m.group(1)}")
        core = core[m.end():]
    steps = [p for p in re.split(r"\s*(?:>|,|(?<=[PK])-)\s*", core) if p]
    # "Whirl > 6LK": a stance or state name first; keep it as a note.
    if steps and re.match(r"^[A-Za-z]{3,}$", steps[0]) and not re.fullmatch(r"(LP|MP|HP|LK|MK|HK|P|K)+", steps[0]):
        notes.append(f"during {steps[0]}")
        steps = steps[1:]
    # "> 5": let the stick return to neutral.
    if len(steps) > 1 and steps[-1] == "5":
        notes.append("then return the stick to neutral")
        steps = steps[:-1]
    tokens = []
    for i, step in enumerate(steps):
        # Spaces inside a step are presses in sequence ("LP LP 6 LK HP").
        parts = step.split()
        seq = []
        for part in parts:
            t = parse_step(part)
            if t is None:
                return None, ", ".join(notes)
            seq += t
        if i:
            tokens.append("goes_into")
        tokens += seq
    return tokens, ", ".join(n for n in notes if n not in ("cl", "far"))


def section_for(move):
    t = move.get("moveType")
    cmd = move.get("numCmd") or ""
    if t in ("special", "command-grab", "movement-special"):
        return "Special moves"
    if t == "super":
        return "Super Arts"
    if t == "throw":
        return "Throws"
    if t in ("drive", "universal-oh"):
        return "System"
    if t == "normal" or t is None:
        if ">" in cmd or "," in cmd:
            return "Target combos"
        if re.match(r"^[1346]", cmd):
            return "Unique attacks"
        return "Normal moves"
    return None  # taunts and the like


def frames_of(move, label=None):
    """A move's frame data, as numbers where FAT has numbers and text otherwise ("KD +30")."""
    row = {"label": label} if label else {}
    for src, dst in FRAME_FIELDS:
        v = move.get(src)
        if v in (None, "", "-", "~"):
            continue
        if isinstance(v, float) and v.is_integer():
            v = int(v)
        row[dst] = v
    return row if len(row) > (1 if label else 0) else None


def strength_label(move, base):
    """'LP Shoryuken' / 'Light Shoryuken' / 'OD Shoryuken' → 'LP' / 'Light' / 'OD'."""
    m = STRENGTH.match(move["moveName"])
    if m:
        return m.group(1)
    m = re.search(r"([LMH][PK]|PP|KK|PPP|KKK)\b", move.get("numCmd") or "")
    return m.group(1) if m else None


def generalise(cmd, variants):
    """With several strengths, 236LP becomes 236P."""
    if len(variants) < 2:
        return cmd
    return re.sub(r"(?<![A-Z])[LMH](P|K)(?![A-Z])", r"\1", cmd)


def old_notes(path):
    """Hand-written notes from the list as first committed (before generation),
    keyed by lower-case move name, so reruns never lose or duplicate them."""
    import subprocess
    rel = path.relative_to(ROOT).as_posix()
    first = subprocess.run(["git", "log", "--diff-filter=A", "--format=%H", "--", rel],
                           cwd=ROOT, capture_output=True, text=True).stdout.split()
    if not first:
        return {}
    text = subprocess.run(["git", "show", f"{first[-1]}:{rel}"], cwd=ROOT, capture_output=True, text=True).stdout
    if not text:
        return {}
    notes = {}
    for s in json.loads(text).get("slots", []):
        lines = s.get("name", "").split("\n")
        name = lines[0].replace("[>]", "").strip().lower()
        # Only hand-written notes (extra lines in the name); generated lists keep
        # theirs in "notes", which is rebuilt from the data each run.
        extra = " ".join(l.strip().strip("()") for l in lines[1:] if l.strip())
        if extra and not s.get("section"):
            notes[name] = extra
    return notes


def fold_variants(slots):
    """'Kachousen (stock)' with the same input as 'Kachousen' becomes a note on it."""
    out = []
    for slot in slots:
        m = re.match(r"^(.*?)\s*\(([^)]*)\)$", slot["name"])
        root = next((o for o in out if m and o["name"] == m.group(1) and o["section"] == slot["section"]
                     and o["tokens"] == slot["tokens"]), None)
        if root:
            label = "Critical Art (low health)" if m.group(2) == "Critical Art" else m.group(2)
            root.setdefault("_also", []).append(label)
        else:
            out.append(slot)
    for o in out:
        also = o.pop("_also", None)
        if also:
            o["notes"] = "; ".join(x for x in [o["notes"], "Also: " + ", ".join(also)] if x)
    return out


def build(fat_dir):
    report = []
    for code, (game, glyph) in GAMES.items():
        data = json.loads((Path(fat_dir) / "src/js/constants/framedata" / f"{code}FrameData.json").read_text(encoding="utf-8"))
        for fat_name, char in data.items():
            name = RENAME.get(fat_name, fat_name)
            path = OUT / game / f"{name}.json"
            keep = old_notes(path)
            groups = OrderedDict()
            for move in char["moves"]["normal"].values():
                sec = section_for(move)
                if not sec or not move.get("numCmd"):
                    continue
                base = STRENGTH.sub("", move["moveName"]).strip()
                groups.setdefault((sec, base), []).append(move)
            slots, skipped = [], []
            for sec in SECTIONS:
                for (s, base), moves in groups.items():
                    if s != sec:
                        continue
                    normal = [m for m in moves if not re.match(r"^(EX|OD)\s", m["moveName"])] or moves
                    boosted = [m for m in moves if re.match(r"^(EX|OD)\s", m["moveName"])]
                    cmd = generalise(normal[0]["numCmd"], normal)
                    tokens, note = parse_input(cmd)
                    notes = [n for n in [note] if n]
                    if tokens is None:
                        # Described in words ("hold & release PP"): keep it, with the text as the input.
                        skipped.append(f"{base} ({cmd})")
                        tokens, notes = [], [f"Input: {cmd}"]
                    if boosted:
                        notes.append(("OD" if code == "SF6" else "EX") + ": " + boosted[0]["numCmd"].split("(")[0].strip())
                    if base.lower() in keep:
                        notes.append(keep[base.lower()])
                    labelled = len(moves) > 1
                    frames = [f for f in (frames_of(m, strength_label(m, base) if labelled else None) for m in normal + boosted) if f]
                    slot = {"name": base, "tokens": tokens, "section": sec, "notes": "; ".join(dict.fromkeys(notes))}
                    if frames:
                        slot["frames"] = frames
                    slots.append(slot)
            slots = fold_variants(slots)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps({"glyph": glyph, "game": game, "character": name, "slot_count": len(slots), "slots": slots}, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            report.append(f"{game} / {name}: {len(slots)} moves" + (f", {len(skipped)} as text: {', '.join(skipped)}" if skipped else ""))
    print("\n".join(report))


if __name__ == "__main__":
    build(sys.argv[1])
