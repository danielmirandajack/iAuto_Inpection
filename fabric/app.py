from __future__ import annotations

import asyncio
import time
from collections import deque
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import db
import store
from camera import CameraWorker
from config import (
    DEFAULT_AUTO_GOOD_SEC,
    DEFAULT_FOV_WIDTH_CM,
    DEFAULT_SPEED_M_PER_MIN,
    HOST,
    PORT,
    STATIC_DIR,
    STREAM_FPS,
    ensure_dirs,
)
from inference import Detector, list_trained_models
from session import InspectionClock
from train import TrainJob

camera = CameraWorker()
clock = InspectionClock()
detector = Detector()
trainer = TrainJob()


def _on_weights_updated(sku_name: str) -> None:
    if detector.sku_name == sku_name:
        detector.unload()


trainer.on_weights_updated = _on_weights_updated
latest_detections: list[dict] = []
_last_infer = 0.0
session_mode = "capture"
active_alert: dict | None = None
alert_log: deque = deque(maxlen=40)
_last_event_key = ""
_last_event_at = 0.0
ALERT_COOLDOWN_SEC = 2.5


class StartBody(BaseModel):
    sku_id: int
    camera_index: int = 0
    speed_m_per_min: float = Field(DEFAULT_SPEED_M_PER_MIN, gt=0, le=30)
    fov_width_cm: float = Field(DEFAULT_FOV_WIDTH_CM, gt=1, le=200)
    auto_good_sec: float = Field(DEFAULT_AUTO_GOOD_SEC, ge=0, le=120)
    mode: str = "capture"


class SkuBody(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    notes: str = ""


class SelectFrameBody(BaseModel):
    index: int


class SampleBody(BaseModel):
    class_slug: str
    bbox: list[float] | None = None
    origin: str = "manual_pause"


class TrainBody(BaseModel):
    sku_id: int
    epochs: int | None = Field(default=None, ge=5, le=200)


class ResetBody(BaseModel):
    sku_id: int


class CameraControlsBody(BaseModel):
    exposure: int = Field(-2, ge=-8, le=0)
    gain: int = Field(64, ge=0, le=128)
    brightness: int = Field(0, ge=0, le=64)
    contrast: int = Field(50, ge=0, le=100)
    saturation: int = Field(64, ge=0, le=100)


def _camera_controls_from_config() -> dict[str, int]:
    cfg = db.get_config()
    defaults = {
        "exposure": -2,
        "gain": 64,
        "brightness": 0,
        "contrast": 50,
        "saturation": 64,
    }
    controls = {}
    for key, default in defaults.items():
        try:
            controls[key] = int(float(cfg.get(f"camera_{key}", default)))
        except (TypeError, ValueError):
            controls[key] = default
    return controls


def _clock_hms() -> str:
    return datetime.now().strftime("%H:%M:%S")


def _class_label(slug: str) -> str:
    klass = db.get_class_by_slug(slug)
    return klass["label"] if klass else slug.replace("_", " ")


def _register_detections(frame, meters: float) -> None:
    global active_alert, _last_event_key, _last_event_at
    if session_mode != "production":
        return
    now = time.monotonic()
    if not latest_detections:
        if active_alert and now > float(active_alert.get("hold_until", 0)):
            active_alert["active"] = False
        return

    best = max(latest_detections, key=lambda item: item["confidence"])
    clock_time = _clock_hms()
    label = _class_label(best["class_slug"])
    bbox = tuple(best["bbox"])
    active_alert = {
        "active": True,
        "clock_time": clock_time,
        "meters": round(meters, 3),
        "class_slug": best["class_slug"],
        "class_label": label,
        "confidence": round(best["confidence"] * 100),
        "hold_until": now + ALERT_COOLDOWN_SEC,
    }
    key = best["class_slug"]
    if key == _last_event_key and now - _last_event_at < ALERT_COOLDOWN_SEC:
        return
    _last_event_key = key
    _last_event_at = now
    klass = db.get_class_by_slug(best["class_slug"])
    image_path = None
    try:
        sku = db.fetch_one("SELECT * FROM skus WHERE id = ?", (clock.sku_id,))
        if sku:
            image_path, _ = store.save_frame(frame, sku["name"], "eventos", bbox)
    except Exception:
        image_path = None
    db.insert_event(
        sku_id=clock.sku_id or 0,
        class_id=klass["id"] if klass else None,
        confidence=best["confidence"],
        meters=meters,
        bbox=bbox,
        session_id=clock.session_id,
        image_path=image_path,
    )
    alert_log.appendleft(
        {
            "clock_time": clock_time,
            "meters": round(meters, 3),
            "class_label": label,
            "confidence": round(best["confidence"] * 100),
        }
    )


def _on_frame(frame, meters: float) -> None:
    global latest_detections, _last_infer
    if clock.session_id is None or clock._paused:
        return
    sku = db.fetch_one("SELECT * FROM skus WHERE id = ?", (clock.sku_id,)) if clock.sku_id else None
    if detector.sku_name and sku and detector.sku_name != sku["name"]:
        return
    now = time.monotonic()
    if detector.model is not None and now - _last_infer >= 0.3:
        latest_detections = detector.predict(frame)
        _last_infer = now
        _register_detections(frame, meters)
    if session_mode == "capture" and clock.auto_good_sec > 0 and (now - clock.last_auto_good_at) >= clock.auto_good_sec:
        if not latest_detections:
            sku = db.fetch_one("SELECT * FROM skus WHERE id = ?", (clock.sku_id,))
            good = db.get_class_by_slug("bom")
            if sku and good:
                image_path, crop_path = store.save_frame(frame, sku["name"], "bom")
                db.insert_sample(
                    sku_id=sku["id"],
                    class_id=good["id"],
                    image_path=image_path,
                    origin="auto_good",
                    session_id=clock.session_id,
                    crop_path=crop_path,
                    meters=meters,
                )
                clock.last_auto_good_at = time.monotonic()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    ensure_dirs()
    db.init_db()
    camera.set_controls(_camera_controls_from_config())
    camera.set_meters_fn(clock.meters)
    camera.set_on_frame(_on_frame)
    yield
    camera.stop()
    if clock.session_id is not None:
        db.end_session(clock.session_id, clock.meters())


app = FastAPI(title="iAuto Inspection Tecido", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/bootstrap")
def bootstrap():
    skus = db.list_skus()
    cfg = db.get_config()
    fabrics = db.list_fabrics()
    return {
        "skus": skus,
        "classes": db.list_classes(),
        "cameras": camera.list_cameras(),
        "config": cfg,
        "camera": camera.snapshot(),
        "session": {
            "id": clock.session_id,
            "sku_id": clock.sku_id,
            "speed_m_per_min": clock.speed_m_per_min,
            "fov_width_cm": clock.fov_width_cm,
            "auto_good_sec": clock.auto_good_sec,
            "meters": round(clock.meters(), 3),
        },
        "train": trainer.status(),
        "model_loaded": detector.model_path is not None,
        "model_path": str(detector.model_path) if detector.model_path else None,
        "has_trained_model": any(item["has_model"] for item in fabrics),
        "models": list_trained_models(),
        "fabrics": fabrics,
        "mode": session_mode,
        "alert": active_alert,
        "alerts": list(alert_log),
    }


@app.get("/api/live")
def live():
    snap = camera.snapshot()
    sku_id = clock.sku_id
    counts = db.sample_counts(sku_id) if sku_id else []
    mm_px = clock.mm_per_px(snap["width"]) if snap["width"] else 0
    return {
        **snap,
        "meters": round(clock.meters(), 3),
        "session_id": clock.session_id,
        "sku_id": clock.sku_id,
        "detections": latest_detections if not snap["paused"] else [],
        "counts": counts,
        "mm_per_px": round(mm_px, 4),
        "min_defect_mm": round(clock.min_defect_mm(snap["width"] or 1), 2),
        "model_loaded": detector.model is not None,
        "model_path": str(detector.model_path) if detector.model_path else None,
        "model_sku": detector.sku_name,
        "model_error": detector.error,
        "detect_conf": detector.detect_conf,
        "last_max_conf": round(detector.last_max_conf * 100, 1),
        "last_raw_count": detector.last_raw_count,
        "train": trainer.status(),
        "mode": session_mode,
        "alert": active_alert if session_mode == "production" else None,
        "alerts": list(alert_log) if session_mode == "production" else [],
        "clock_time": _clock_hms(),
    }


@app.get("/api/models")
def models(sku: str | None = None):
    items = list_trained_models()
    if sku:
        items = [item for item in items if item["sku"] == sku]
    return {"models": items}


@app.get("/api/fabrics")
@app.get("/api/skus")
def fabrics():
    return {"fabrics": db.list_fabrics(), "skus": db.list_skus()}


@app.post("/api/skus")
def create_sku(body: SkuBody):
    try:
        sku = db.create_sku(body.name, body.notes)
        return {**sku, "fabrics": db.list_fabrics()}
    except Exception as exc:
        raise HTTPException(400, f"Não foi possível criar o tecido: {exc}") from exc


@app.post("/api/camera/controls")
def set_camera_controls(body: CameraControlsBody):
    controls = camera.set_controls(body.model_dump())
    for key, value in controls.items():
        db.set_config(f"camera_{key}", str(value))
    return {"controls": controls}


@app.post("/api/camera/controls/reset")
def reset_camera_controls():
    controls = camera.set_controls(
        {
            "exposure": -2,
            "gain": 64,
            "brightness": 0,
            "contrast": 50,
            "saturation": 64,
        }
    )
    for key, value in controls.items():
        db.set_config(f"camera_{key}", str(value))
    return {"controls": controls}


@app.post("/api/session/start")
def start_session(body: StartBody):
    global session_mode, active_alert, _last_event_key, _last_event_at
    sku = db.fetch_one("SELECT * FROM skus WHERE id = ?", (body.sku_id,))
    if not sku:
        raise HTTPException(404, "Tecido não encontrado")
    mode = body.mode if body.mode in ("capture", "production") else "capture"
    if mode == "production":
        model_id = f"{sku['name']}/best.pt"
        loaded = detector.load_path(model_id, sku_name=sku["name"])
        if not loaded:
            raise HTTPException(
                400,
                f"O tecido '{sku['name']}' ainda não tem modelo treinado. "
                "Em Captura, grave amostras deste tecido e clique em Treinar modelo.",
            )
        db.set_config("model_id", model_id)
    if clock.session_id is not None:
        db.end_session(clock.session_id, clock.stop())
    camera.set_controls(_camera_controls_from_config())
    try:
        camera.start(body.camera_index)
    except RuntimeError as exc:
        raise HTTPException(400, str(exc)) from exc
    session = db.start_session(sku["id"], body.speed_m_per_min, body.fov_width_cm)
    auto_good = 0.0 if mode == "production" else body.auto_good_sec
    clock.start(session["id"], sku["id"], body.speed_m_per_min, body.fov_width_cm, auto_good)
    db.set_config("sku_id", str(sku["id"]))
    db.set_config("speed_m_per_min", str(body.speed_m_per_min))
    db.set_config("fov_width_cm", str(body.fov_width_cm))
    db.set_config("auto_good_sec", str(auto_good))
    if mode == "capture":
        if not detector.load_for_sku(sku["name"]):
            detector.unload()
    session_mode = mode
    active_alert = None
    alert_log.clear()
    _last_event_key = ""
    _last_event_at = 0.0
    return {
        "session": session,
        "camera": camera.snapshot(),
        "model_loaded": detector.model is not None,
        "model_path": str(detector.model_path) if detector.model_path else None,
        "model_sku": detector.sku_name,
        "mode": session_mode,
    }


@app.post("/api/session/stop")
def stop_session():
    global session_mode, active_alert
    session_id = clock.session_id
    meters = clock.meters()
    camera.stop()
    if session_id is not None:
        db.end_session(session_id, meters)
    clock.stop()
    session_mode = "capture"
    active_alert = None
    return {"ok": True, "meters": round(meters, 3)}


@app.post("/api/pause")
def pause():
    if not camera.state.running:
        raise HTTPException(400, "Câmera não está ligada")
    frames = camera.pause()
    clock.pause()
    return {
        "paused": True,
        "selected_index": camera.state.selected_index,
        "frames": [
            {"index": i, "meters": round(f.meters, 3)}
            for i, f in enumerate(frames)
        ],
    }


@app.post("/api/resume")
def resume():
    camera.resume()
    clock.resume()
    return {"paused": False}


@app.post("/api/buffer/select")
def select_frame(body: SelectFrameBody):
    frame = camera.select_frame(body.index)
    if frame is None:
        raise HTTPException(400, "Nenhum buffer pausado")
    return {"index": camera.state.selected_index, "meters": round(frame.meters, 3)}


@app.get("/api/buffer/{index}/thumb")
def buffer_thumb(index: int):
    with camera._lock:
        frames = camera.state.frozen
        if index < 0 or index >= len(frames):
            raise HTTPException(404, "Frame não encontrado")
        jpeg = frames[index].thumb
    return Response(content=jpeg, media_type="image/jpeg")


@app.post("/api/samples")
def save_sample(body: SampleBody):
    if clock.sku_id is None:
        raise HTTPException(400, "Inicie uma sessão primeiro")
    klass = db.get_class_by_slug(body.class_slug)
    if not klass:
        raise HTTPException(404, "Classe inválida")
    bbox = None
    if body.bbox:
        if len(body.bbox) != 4:
            raise HTTPException(400, "bbox deve ser [x, y, w, h] normalizado")
        bbox = tuple(float(v) for v in body.bbox)
        if bbox[2] < 0.005 or bbox[3] < 0.005:
            raise HTTPException(400, "Caixa demasiado pequena")
        if not klass["is_good"] and bbox is None:
            raise HTTPException(400, "Defeito precisa de caixa")
    elif not klass["is_good"]:
        raise HTTPException(400, "Defeito precisa de uma caixa desenhada no tecido")

    frame = camera.decode_selected()
    if frame is None:
        raise HTTPException(400, "Sem imagem da câmera. Ligue a câmera e tente de novo.")
    sku = db.fetch_one("SELECT * FROM skus WHERE id = ?", (clock.sku_id,))
    if not sku:
        raise HTTPException(400, "SKU da sessão não encontrado")
    try:
        image_path, crop_path = store.save_frame(frame, sku["name"], klass["slug"], bbox)
        sample_id = db.insert_sample(
            sku_id=sku["id"],
            class_id=klass["id"],
            image_path=image_path,
            origin=body.origin,
            session_id=clock.session_id,
            crop_path=crop_path,
            bbox=bbox,
            meters=clock.meters(),
        )
    except Exception as exc:
        raise HTTPException(500, f"Não foi possível gravar a amostra: {exc}") from exc
    return {"id": sample_id, "counts": db.sample_counts(sku["id"])}


@app.get("/api/samples")
def samples(sku_id: int | None = None):
    target = sku_id if sku_id is not None else clock.sku_id
    if target is None:
        return []
    return db.list_samples(target, limit=120)


@app.delete("/api/samples/{sample_id}")
def delete_sample(sample_id: int):
    if trainer.running:
        raise HTTPException(400, "Espere o treino terminar antes de apagar fotos.")
    if session_mode == "production":
        raise HTTPException(400, "Pare a produção antes de apagar fotos de treino.")
    sample = db.get_sample(sample_id)
    if not sample:
        raise HTTPException(404, "Foto não encontrada")
    db.delete_sample(sample_id)
    store.delete_sample_files(sample.get("image_path"), sample.get("crop_path"))
    return {
        "ok": True,
        "id": sample_id,
        "fabrics": db.list_fabrics(),
        "counts": db.sample_counts(sample["sku_id"]),
        "message": (
            f"Foto '{sample['class_label']}' apagada. "
            "Já não entra no próximo treino. "
            "O modelo actual só muda quando treinar de novo."
        ),
    }


@app.get("/api/media/{path:path}")
def media(path: str):
    file_path = store.resolve_path(path)
    if not file_path.exists():
        raise HTTPException(404, "Arquivo não encontrado")
    return FileResponse(file_path)


@app.post("/api/train")
def train(body: TrainBody):
    if session_mode == "production":
        raise HTTPException(
            400,
            "Pare a produção antes de treinar. Cada tecido treina só com as suas fotos.",
        )
    sku = db.fetch_one("SELECT * FROM skus WHERE id = ?", (body.sku_id,))
    if not sku:
        raise HTTPException(404, "Tecido não encontrado")
    return trainer.start(sku["id"], sku["name"], body.epochs)


@app.post("/api/train/reset")
def reset_train(body: ResetBody):
    if trainer.running:
        raise HTTPException(400, "Espere o treino atual terminar antes de limpar.")
    if session_mode == "production":
        raise HTTPException(400, "Pare a produção antes de limpar o treino.")
    sku = db.fetch_one("SELECT * FROM skus WHERE id = ?", (body.sku_id,))
    if not sku:
        raise HTTPException(404, "Tecido não encontrado")
    if detector.sku_name == sku["name"]:
        detector.unload()
    db.clear_training(sku["id"])
    store.wipe_sku_data(sku["name"])
    trainer.message = f"Fotos e modelo de '{sku['name']}' apagados. Grave novas amostras e treine de novo."
    trainer.ok = True
    return {
        "ok": True,
        "message": trainer.message,
        "fabrics": db.list_fabrics(),
        "counts": db.sample_counts(sku["id"]),
    }


@app.get("/api/train")
def train_status():
    return trainer.status()


@app.get("/api/frame")
def still_frame():
    jpeg = camera.get_selected_jpeg()
    if not jpeg:
        return Response(status_code=204)
    return Response(
        content=jpeg,
        media_type="image/jpeg",
        headers={"Cache-Control": "no-store, no-cache, must-revalidate"},
    )


@app.get("/api/stream")
async def stream():
    boundary = b"frame"

    async def generate():
        interval = 1 / STREAM_FPS
        while True:
            jpeg = camera.get_selected_jpeg()
            if jpeg:
                yield b"--" + boundary + b"\r\nContent-Type: image/jpeg\r\n\r\n" + jpeg + b"\r\n"
            await asyncio.sleep(interval)

    return StreamingResponse(generate(), media_type="multipart/x-mixed-replace; boundary=frame")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host=HOST, port=PORT, reload=False)
