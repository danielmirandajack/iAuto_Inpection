from __future__ import annotations

from datetime import datetime
from pathlib import Path

import numpy as np

from config import DETECT_CONF, MODELS_DIR, ensure_dirs


def sku_weights_path(sku_name: str) -> Path:
    return MODELS_DIR / sku_name / "best.pt"


def list_trained_models() -> list[dict]:
    ensure_dirs()
    items = []
    if not MODELS_DIR.exists():
        return items
    for sku_dir in MODELS_DIR.iterdir():
        if not sku_dir.is_dir():
            continue
        best = sku_dir / "best.pt"
        if not best.exists():
            continue
        mtime = datetime.fromtimestamp(best.stat().st_mtime)
        items.append(
            {
                "id": f"{sku_dir.name}/best.pt",
                "sku": sku_dir.name,
                "label": f"{sku_dir.name} ({mtime.strftime('%d/%m/%Y %H:%M')})",
                "mtime": mtime.timestamp(),
            }
        )
    items.sort(key=lambda item: item["mtime"], reverse=True)
    return items


def safe_model_path(model_id: str) -> Path:
    rel = Path(model_id.replace("\\", "/"))
    if rel.is_absolute() or ".." in rel.parts:
        raise ValueError("Caminho de modelo inválido")
    path = (MODELS_DIR / rel).resolve()
    root = MODELS_DIR.resolve()
    if root not in path.parents:
        raise ValueError("O modelo tem de estar em fabric/data/models/")
    if not path.exists() or path.suffix.lower() != ".pt":
        raise FileNotFoundError("Ficheiro de modelo não encontrado")
    return path


def resolve_weights(sku_name: str) -> Path | None:
    path = sku_weights_path(sku_name)
    return path if path.exists() else None


class Detector:
    def __init__(self) -> None:
        self.model = None
        self.model_path: Path | None = None
        self.names: dict[int, str] = {}
        self.error: str | None = None
        self.sku_name: str | None = None
        self.last_max_conf: float = 0.0
        self.last_raw_count: int = 0
        self.detect_conf: float = DETECT_CONF

    def unload(self) -> None:
        self.model = None
        self.model_path = None
        self.names = {}
        self.error = None
        self.sku_name = None
        self.last_max_conf = 0.0
        self.last_raw_count = 0

    def load_path(self, model_id: str, sku_name: str | None = None) -> bool:
        try:
            target = safe_model_path(model_id)
        except Exception as exc:
            self.unload()
            self.error = str(exc)
            return False
        if sku_name and not model_id.replace("\\", "/").startswith(f"{sku_name}/"):
            self.unload()
            self.error = f"O modelo não pertence ao tecido '{sku_name}'."
            return False
        return self._load(target, sku_name)

    def load_for_sku(self, sku_name: str) -> bool:
        target = resolve_weights(sku_name)
        if not target:
            self.unload()
            self.error = f"O tecido '{sku_name}' ainda não tem modelo treinado."
            return False
        return self._load(target, sku_name)

    def _load(self, target: Path, sku_name: str | None) -> bool:
        try:
            from ultralytics import YOLO

            self.model = YOLO(str(target))
            self.model_path = target
            self.names = getattr(self.model, "names", {}) or {}
            self.error = None
            self.sku_name = sku_name or target.parent.name
            return True
        except Exception as exc:
            self.unload()
            self.error = str(exc)
            return False

    def predict(self, frame: np.ndarray, imgsz: int = 640, conf: float | None = None) -> list[dict]:
        if self.model is None:
            self.last_max_conf = 0.0
            self.last_raw_count = 0
            return []
        threshold = DETECT_CONF if conf is None else conf
        self.detect_conf = threshold
        try:
            results = self.model.predict(frame, imgsz=imgsz, conf=min(0.01, threshold), verbose=False)
        except Exception as exc:
            self.error = str(exc)
            self.last_max_conf = 0.0
            self.last_raw_count = 0
            return []
        detections = []
        h, w = frame.shape[:2]
        for result in results:
            boxes = getattr(result, "boxes", None)
            if boxes is None:
                continue
            for box in boxes:
                xyxy = box.xyxy[0].tolist()
                cls_id = int(box.cls[0])
                detections.append(
                    {
                        "class_id": cls_id,
                        "class_slug": self.names.get(cls_id, str(cls_id)),
                        "confidence": float(box.conf[0]),
                        "bbox": [
                            xyxy[0] / w,
                            xyxy[1] / h,
                            (xyxy[2] - xyxy[0]) / w,
                            (xyxy[3] - xyxy[1]) / h,
                        ],
                    }
                )
        self.last_raw_count = len(detections)
        self.last_max_conf = max((item["confidence"] for item in detections), default=0.0)
        return [item for item in detections if item["confidence"] >= threshold]
