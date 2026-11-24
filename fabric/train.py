from __future__ import annotations

import shutil
import threading
from pathlib import Path

from config import DETECT_CONF, FINETUNE_EPOCHS, MODELS_DIR, TRAIN_EPOCHS
from dataset import export_yolo_dataset


class TrainJob:
    def __init__(self) -> None:
        self.running = False
        self.message = "Nenhum treino iniciado."
        self.ok = True
        self.sku_id: int | None = None
        self.sku_name: str | None = None
        self.has_model = False
        self.on_weights_updated = None
        self._thread: threading.Thread | None = None

    def status(self) -> dict:
        return {
            "running": self.running,
            "ok": self.ok,
            "message": self.message,
            "sku_id": self.sku_id,
            "sku_name": self.sku_name,
            "has_model": self.has_model,
        }

    def start(self, sku_id: int, sku_name: str, epochs: int | None = None) -> dict:
        if self.running:
            return self.status()

        def worker() -> None:
            self.running = True
            self.ok = True
            self.sku_id = sku_id
            self.sku_name = sku_name
            self.has_model = False
            snapshot = None
            try:
                self.message = "A juntar todas as fotos deste tecido (defeitos antigos e novos)..."
                exported = export_yolo_dataset(sku_id, sku_name)
                try:
                    from ultralytics import YOLO
                except ImportError:
                    self.ok = False
                    self.message = (
                        "Dataset exportado em "
                        + exported["dataset_yaml"]
                        + ". Instale o treino: pip install -r requirements-train.txt"
                    )
                    return

                dest = MODELS_DIR / sku_name / "best.pt"
                finetune = dest.exists()
                if finetune:
                    snapshot = dest.with_name("_base.pt")
                    shutil.copy2(dest, snapshot)
                    start_weights = snapshot
                    previous_names = set(_model_names(start_weights))
                    new_classes = [
                        name for name in exported["classes"].values() if name not in previous_names
                    ]
                    auto_epochs = TRAIN_EPOCHS if new_classes else FINETUNE_EPOCHS
                    mode_label = (
                        f"a atualizar o modelo com novo(s) defeito(s): {', '.join(new_classes)}"
                        if new_classes
                        else "a reforçar o modelo com mais fotos dos defeitos já conhecidos"
                    )
                else:
                    coco = MODELS_DIR / "yolo11n.pt"
                    start_weights = coco if coco.exists() else Path("yolo11n.pt")
                    new_classes = list(exported["classes"].values())
                    auto_epochs = TRAIN_EPOCHS
                    mode_label = "primeiro treino deste tecido"

                use_epochs = int(epochs or auto_epochs)
                class_summary = ", ".join(
                    f"{slug}×{exported['class_counts'].get(slug, 0)}"
                    for slug in exported["classes"].values()
                )
                self.message = (
                    f"Tecido '{sku_name}': {mode_label}. "
                    f"Classes {class_summary}. "
                    f"{exported['train_images']} fotos de treino, {use_epochs} épocas..."
                )
                model = YOLO(str(start_weights))
                small = bool(exported.get("small_set"))
                results = model.train(
                    data=exported["dataset_yaml"],
                    epochs=use_epochs,
                    imgsz=640,
                    batch=2,
                    device="cpu",
                    project=str(MODELS_DIR / sku_name),
                    name=exported.get("run_name", "train"),
                    exist_ok=True,
                    patience=25,
                    workers=0,
                    plots=False,
                    mosaic=0.0 if small else 1.0,
                    close_mosaic=0 if small else 10,
                    mixup=0.0,
                    copy_paste=0.0,
                    erasing=0.0,
                    hsv_h=0.02,
                    hsv_s=0.4,
                    hsv_v=0.3,
                    degrees=8.0 if small else 0.0,
                    translate=0.08,
                    scale=0.25 if small else 0.5,
                    fliplr=0.5,
                    freeze=10 if small else 0,
                )
                best = Path(results.save_dir) / "weights" / "best.pt"
                dest.parent.mkdir(parents=True, exist_ok=True)
                if best.exists():
                    shutil.copy2(best, dest)
                self.has_model = dest.exists()
                peaks = _peak_by_class(dest, Path(exported["dataset_yaml"]).parent / "images" / "train")
                peak_text = ", ".join(
                    f"{slug} {round(score * 100, 1)}%" for slug, score in peaks.items()
                ) or "n/d"
                self.message = (
                    f"Treino concluído para '{sku_name}' ({mode_label}). "
                    f"Um só modelo em produção: {dest}. "
                    f"Confiança por defeito: {peak_text}."
                )
                weak = [slug for slug, score in peaks.items() if score < DETECT_CONF]
                if weak:
                    self.message += (
                        " Ainda fraco em: "
                        + ", ".join(weak)
                        + ". Grave mais fotos desses tipos (com caixa) e treine de novo."
                    )
                if self.has_model and callable(self.on_weights_updated):
                    self.on_weights_updated(sku_name)
            except Exception as exc:
                self.ok = False
                self.message = str(exc)
            finally:
                if snapshot and snapshot.exists():
                    try:
                        snapshot.unlink()
                    except OSError:
                        pass
                self.running = False

        self._thread = threading.Thread(target=worker, daemon=True)
        self._thread.start()
        return self.status()


def _model_names(weights: Path) -> list[str]:
    try:
        from ultralytics import YOLO

        names = YOLO(str(weights)).names or {}
        if isinstance(names, dict):
            return [str(names[key]) for key in sorted(names, key=lambda item: int(item))]
        return [str(item) for item in names]
    except Exception:
        return []


def _peak_by_class(weights: Path, image_dir: Path) -> dict[str, float]:
    if not weights.exists() or not image_dir.exists():
        return {}
    try:
        import cv2
        from ultralytics import YOLO
    except ImportError:
        return {}
    model = YOLO(str(weights))
    names = model.names or {}
    if isinstance(names, dict):
        peaks = {str(name): 0.0 for name in names.values()}
    else:
        peaks = {str(name): 0.0 for name in names}
    for path in sorted(image_dir.glob("*.jpg"))[:24]:
        frame = cv2.imread(str(path))
        if frame is None:
            continue
        result = model.predict(frame, imgsz=640, conf=0.01, verbose=False)[0]
        boxes = getattr(result, "boxes", None)
        if boxes is None or len(boxes) == 0:
            continue
        for box in boxes:
            slug = str(names.get(int(box.cls[0]), int(box.cls[0])))
            peaks[slug] = max(peaks.get(slug, 0.0), float(box.conf[0]))
    return peaks
