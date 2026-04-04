from __future__ import annotations

from pathlib import Path
import math

import cv2
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
VIDEOS_DIR = ROOT / "frontend" / "public" / "videos"


def blend(base: np.ndarray, overlay: np.ndarray, alpha: float) -> np.ndarray:
    return cv2.addWeighted(base, 1.0, overlay, alpha, 0)


def gradient_frame(width: int, height: int, top: tuple[int, int, int], bottom: tuple[int, int, int]) -> np.ndarray:
    y = np.linspace(0, 1, height, dtype=np.float32).reshape(height, 1, 1)
    top_arr = np.array(top, dtype=np.float32).reshape(1, 1, 3)
    bottom_arr = np.array(bottom, dtype=np.float32).reshape(1, 1, 3)
    return np.repeat((top_arr * (1 - y) + bottom_arr * y).astype(np.uint8), width, axis=1)


def add_glow_orb(frame: np.ndarray, center: tuple[int, int], radius: int, color: tuple[int, int, int], alpha: float) -> np.ndarray:
    glow = np.zeros_like(frame)
    cv2.circle(glow, center, radius, color, -1, cv2.LINE_AA)
    glow = cv2.GaussianBlur(glow, (0, 0), sigmaX=max(radius / 2, 1), sigmaY=max(radius / 2, 1))
    return blend(frame, glow, alpha)


def add_grid(frame: np.ndarray, spacing: int, color: tuple[int, int, int], alpha: float) -> np.ndarray:
    h, w = frame.shape[:2]
    grid = np.zeros_like(frame)
    for x in range(0, w, spacing):
        cv2.line(grid, (x, 0), (x, h), color, 1, cv2.LINE_AA)
    for y in range(0, h, spacing):
        cv2.line(grid, (0, y), (w, y), color, 1, cv2.LINE_AA)
    return blend(frame, grid, alpha)


def add_scanlines(frame: np.ndarray, step: int, darkness: float) -> np.ndarray:
    out = frame.astype(np.float32)
    out[::step, :, :] *= 1 - darkness
    return np.clip(out, 0, 255).astype(np.uint8)


def add_text_panel(frame: np.ndarray, title: str, subtitle: str, accent: tuple[int, int, int]) -> np.ndarray:
    out = frame.copy()
    h, w = out.shape[:2]
    panel = np.zeros_like(out)
    cv2.rectangle(panel, (42, 34), (w - 42, 106), (8, 14, 24), -1)
    cv2.rectangle(panel, (42, 34), (w - 42, 106), accent, 2)
    out = blend(out, panel, 0.22)
    cv2.putText(out, title, (62, 69), cv2.FONT_HERSHEY_DUPLEX, 0.92, (244, 247, 255), 2, cv2.LINE_AA)
    cv2.putText(out, subtitle, (62, 95), cv2.FONT_HERSHEY_SIMPLEX, 0.56, accent, 2, cv2.LINE_AA)
    return out


def make_mainbg_frame(width: int, height: int, index: int, total: int) -> np.ndarray:
    t = index / total
    frame = gradient_frame(width, height, (4, 10, 24), (26, 6, 14))
    frame = add_grid(frame, 56, (70, 180, 255), 0.13)
    frame = add_glow_orb(frame, (int(width * (0.14 + 0.03 * math.sin(t * math.tau))), int(height * 0.24)), int(height * 0.19), (255, 118, 78), 0.28)
    frame = add_glow_orb(frame, (int(width * (0.82 + 0.04 * math.cos(t * math.tau))), int(height * 0.2)), int(height * 0.17), (68, 205, 255), 0.32)

    streaks = np.zeros_like(frame)
    shift = int(t * width * 1.2)
    for k in range(-height, width, 130):
        cv2.line(streaks, (k + shift, 0), (k - height + shift, height), (255, 90, 150), 1, cv2.LINE_AA)
    streaks = cv2.GaussianBlur(streaks, (0, 0), 1.4)
    frame = blend(frame, streaks, 0.18)

    wave = np.zeros_like(frame)
    baseline = int(height * 0.72)
    pts = []
    for x in range(0, width, 14):
        y = int(baseline + 24 * math.sin((x / width) * 8 + t * math.tau * 2))
        pts.append((x, y))
    for a, b in zip(pts, pts[1:]):
        cv2.line(wave, a, b, (70, 220, 255), 2, cv2.LINE_AA)
    frame = blend(frame, cv2.GaussianBlur(wave, (0, 0), 1.0), 0.5)
    frame = add_scanlines(frame, 4, 0.05)
    return add_text_panel(frame, "CITY GRID / TRAFFIXAI", "CINEMATIC NEURAL SURVEILLANCE", (92, 214, 255))


def make_bg_frame(width: int, height: int, index: int, total: int) -> np.ndarray:
    t = index / total
    frame = gradient_frame(width, height, (8, 8, 18), (34, 4, 28))
    frame = add_grid(frame, 48, (255, 110, 190), 0.1)
    frame = add_glow_orb(frame, (int(width * 0.22), int(height * (0.82 - 0.05 * math.sin(t * math.tau)))), int(height * 0.17), (255, 84, 166), 0.28)
    frame = add_glow_orb(frame, (int(width * 0.78), int(height * (0.24 + 0.06 * math.cos(t * math.tau)))), int(height * 0.15), (70, 208, 255), 0.22)

    arcs = np.zeros_like(frame)
    center = (int(width * 0.55), int(height * 0.56))
    for r in (90, 150, 220, 300):
        end = int((t * 360 + r) % 360)
        cv2.ellipse(arcs, center, (r, r // 2), 0, 0, end, (255, 118, 188), 1, cv2.LINE_AA)
    frame = blend(frame, cv2.GaussianBlur(arcs, (0, 0), 1.3), 0.34)

    particles = np.zeros_like(frame)
    for p in range(18):
        x = int((p / 18 * width + t * width * 0.4 + p * 37) % width)
        y = int((height * (0.18 + (p % 7) * 0.09 + 0.02 * math.sin(t * math.tau * 2 + p))) % height)
        cv2.circle(particles, (x, y), 2 + (p % 3), (255, 230, 255), -1, cv2.LINE_AA)
    frame = blend(frame, cv2.GaussianBlur(particles, (0, 0), 0.8), 0.5)
    frame = add_scanlines(frame, 3, 0.06)
    return add_text_panel(frame, "NEURAL TRAFFIC FEED", "FUTURE MOBILITY VISUALIZATION", (255, 120, 194))


def make_login_frame(width: int, height: int, index: int, total: int) -> np.ndarray:
    t = index / total
    frame = gradient_frame(width, height, (10, 4, 12), (22, 4, 16))
    frame = add_glow_orb(frame, (int(width * 0.5), int(height * 0.44)), int(height * 0.23), (255, 95, 160), 0.26)
    frame = add_glow_orb(frame, (int(width * 0.5), int(height * 0.44)), int(height * 0.14), (76, 206, 255), 0.18)

    rings = np.zeros_like(frame)
    center = (int(width * 0.5), int(height * 0.44))
    for r in (70, 120, 190, 280):
        pulse = int(r + 10 * math.sin(t * math.tau * 2 + r))
        cv2.circle(rings, center, max(pulse, 10), (120, 210, 255), 1, cv2.LINE_AA)
    frame = blend(frame, cv2.GaussianBlur(rings, (0, 0), 1.2), 0.32)

    beams = np.zeros_like(frame)
    for k in range(10):
        angle = t * math.tau + k * (math.tau / 10)
        x2 = int(center[0] + math.cos(angle) * width * 0.44)
        y2 = int(center[1] + math.sin(angle) * height * 0.44)
        cv2.line(beams, center, (x2, y2), (255, 120, 180), 1, cv2.LINE_AA)
    frame = blend(frame, cv2.GaussianBlur(beams, (0, 0), 2.2), 0.18)

    frame = add_grid(frame, 52, (120, 150, 255), 0.06)
    frame = add_scanlines(frame, 3, 0.08)
    return add_text_panel(frame, "SECURE ACCESS", "AI CONTROL SURFACE", (255, 138, 182))


def write_video(path: Path, width: int, height: int, seconds: int, fps: int, factory) -> None:
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), fps, (width, height))
    total = seconds * fps
    for index in range(total):
        writer.write(factory(width, height, index, total))
    writer.release()


def main() -> None:
    write_video(VIDEOS_DIR / "mainbg.mp4", 1280, 720, 10, 24, make_mainbg_frame)
    write_video(VIDEOS_DIR / "bg.mp4", 1280, 720, 8, 24, make_bg_frame)
    write_video(VIDEOS_DIR / "login.mp4", 960, 540, 8, 24, make_login_frame)
    print("Generated new futuristic video assets in", VIDEOS_DIR)


if __name__ == "__main__":
    main()
