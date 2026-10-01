"""Traces the controller pictures in ../icons into clean line art.

Output: white lines on a transparent background in app/assets/controllers/,
which the app tints with the theme colour. Only the tracings ship in the app;
the source pictures don't.

Run after adding or changing a controller picture:
    pip install opencv-python-headless numpy
    python scripts/trace-controllers.py
"""
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "icons"
OUT = ROOT / "app" / "assets" / "controllers"
CONTROLLERS = [
    "dreamcast", "duke", "gamecube", "genesis3b", "genesis6b", "leverlessg13", "n64", "nes",
    "playstation", "playstation5", "qanba", "snes", "wiiupro", "xboxone",
]
SCALE = 3  # trace at higher resolution for smooth lines


def find_source(key: str) -> Path:
    for f in SRC.iterdir():
        if f.suffix.lower() == ".png" and f.stem.lower() == key:
            return f
    raise FileNotFoundError(key)


def drop_small(mask: np.ndarray, min_span: int) -> np.ndarray:
    """Removes specks, lettering and logos: anything whose bounding box is small."""
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    keep = np.zeros_like(mask)
    for i in range(1, n):
        if max(stats[i, cv2.CC_STAT_WIDTH], stats[i, cv2.CC_STAT_HEIGHT]) >= min_span:
            keep[labels == i] = 255
    return keep


def trace(key: str) -> None:
    img = cv2.imread(str(find_source(key)), cv2.IMREAD_UNCHANGED)
    if img.ndim == 2:
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGRA)
    elif img.shape[2] == 3:
        img = cv2.cvtColor(img, cv2.COLOR_BGR2BGRA)
    h, w = img.shape[:2]
    img = cv2.resize(img, (w * SCALE, h * SCALE), interpolation=cv2.INTER_CUBIC)
    alpha = img[:, :, 3]
    silhouette = np.where(alpha > 128, 255, 0).astype(np.uint8)
    silhouette = cv2.morphologyEx(silhouette, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))

    # Outer outline: one smooth contour around the silhouette, drawn bold.
    smooth = cv2.GaussianBlur(silhouette, (0, 0), 3)
    _, smooth = cv2.threshold(smooth, 127, 255, cv2.THRESH_BINARY)
    contours, _ = cv2.findContours(smooth, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    lines = np.zeros_like(silhouette)
    big = [c for c in contours if cv2.contourArea(c) > 0.02 * silhouette.size]
    cv2.drawContours(lines, big, -1, 255, thickness=5, lineType=cv2.LINE_AA)

    # Inner detail: the picture's own edges (buttons, sticks, panels), inside the outline.
    gray = cv2.cvtColor(img[:, :, :3], cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (0, 0), 2.2)
    detail = cv2.Canny(gray, 30, 80)
    inner = cv2.erode(smooth, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (19, 19)))
    detail = cv2.bitwise_and(detail, inner)
    detail = drop_small(detail, 14 * SCALE)
    # Thicken, then re-blur so parallel double edges merge into one stroke.
    detail = cv2.dilate(detail, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
    lines = cv2.max(lines, detail)

    # Soften to anti-aliased strokes.
    lines = cv2.GaussianBlur(lines, (0, 0), 1.1)
    lines = cv2.normalize(lines, None, 0, 255, cv2.NORM_MINMAX)

    out = np.zeros((lines.shape[0], lines.shape[1], 4), np.uint8)
    out[:, :, :3] = 255
    out[:, :, 3] = lines
    # Back to 1.5x the source size: crisp, and coordinates scale cleanly.
    out = cv2.resize(out, (int(w * 1.5), int(h * 1.5)), interpolation=cv2.INTER_AREA)
    cv2.imwrite(str(OUT / f"{key}.png"), out)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for k in CONTROLLERS:
        trace(k)
        print("traced", k)
