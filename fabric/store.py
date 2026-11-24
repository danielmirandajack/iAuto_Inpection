from __future__ import annotations

from pathlib import Path
from uuid import uuid4
import shutil
import time

import cv2
import numpy as np

from config import DATA_DIR, MODELS_DIR, SAMPLES_DIR, YOLO_DIR, ensure_dirs
from db import _safe_sku_name


def _safe_name(value: str) -> str:
    cleaned = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in value.strip())
    return cleaned or "item"


def save_frame(
    frame: np.ndarray,
    sku_name: str,
    class_slug: str,
    bbox: tuple[float, float, float, float] | None = None,
) -> tuple[str, str | None]:
    ensure_dirs()
    folder = SAMPLES_DIR / _safe_sku_name(sku_name) / _safe_name(class_slug)
    folder.mkdir(parents=True, exist_ok=True)
    stem = uuid4().hex
    full_path = folder / f"{stem}.jpg"
    _write_jpeg(full_path, frame)

    crop_rel = None
    if bbox:
        h, w = frame.shape[:2]
        x, y, bw, bh = bbox
        x1 = max(0, int(x * w))
        y1 = max(0, int(y * h))
        x2 = min(w, int((x + bw) * w))
        y2 = min(h, int((y + bh) * h))
        if x2 - x1 >= 4 and y2 - y1 >= 4:
            crop = frame[y1:y2, x1:x2]
            crop_path = folder / f"{stem}_crop.jpg"
            _write_jpeg(crop_path, crop)
            crop_rel = _rel(crop_path)

    return _rel(full_path), crop_rel


def decode_jpeg(jpeg: bytes) -> np.ndarray:
    arr = np.frombuffer(jpeg, dtype=np.uint8)
    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if frame is None:
        raise ValueError("JPEG inválido")
    return frame


def resolve_path(relative: str) -> Path:
    path = (DATA_DIR / relative).resolve()
    if DATA_DIR.resolve() not in path.parents and path != DATA_DIR.resolve():
        raise ValueError("Caminho fora da pasta de dados")
    return path


def delete_sample_files(image_path: str | None, crop_path: str | None = None) -> None:
    for relative in (image_path, crop_path):
        if not relative:
            continue
        try:
            path = resolve_path(relative)
        except ValueError:
            continue
        if path.is_file():
            path.unlink(missing_ok=True)


def wipe_sku_data(sku_name: str) -> None:
    safe = _safe_sku_name(sku_name)
    if not safe:
        raise ValueError("Nome de tecido inválido")
    for folder in (
        SAMPLES_DIR / safe,
        YOLO_DIR / safe,
        MODELS_DIR / safe,
        DATA_DIR / "good" / safe,
    ):
        _rmtree(folder)


def _rmtree(path: Path) -> None:
    if not path.exists():
        return
    resolved = path.resolve()
    if DATA_DIR.resolve() not in resolved.parents:
        raise ValueError("Caminho fora da pasta de dados")
    for _ in range(6):
        try:
            shutil.rmtree(resolved)
            return
        except OSError:
            time.sleep(0.2)
    shutil.rmtree(resolved, ignore_errors=True)


def _write_jpeg(path: Path, image: np.ndarray, quality: int = 92) -> None:
    ok, buf = cv2.imencode(".jpg", image, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not ok:
        raise RuntimeError(f"Falha ao compactar JPEG em {path}")
    path.write_bytes(buf.tobytes())


def _rel(path: Path) -> str:
    return path.resolve().relative_to(DATA_DIR.resolve()).as_posix()
