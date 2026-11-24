from __future__ import annotations

import threading
import time
from collections import deque
from dataclasses import dataclass, field

import cv2
import numpy as np

from config import BUFFER_SECONDS, JPEG_QUALITY, TARGET_HEIGHT, TARGET_WIDTH


@dataclass
class BufferFrame:
    jpeg: bytes
    thumb: bytes
    ts: float
    meters: float


@dataclass
class CameraState:
    running: bool = False
    paused: bool = False
    camera_index: int = 0
    fps: float = 0.0
    width: int = 0
    height: int = 0
    brightness: float = 0.0
    error: str | None = None
    latest_jpeg: bytes | None = None
    selected_index: int = -1
    frozen: list[BufferFrame] = field(default_factory=list)


class CameraWorker:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._cap: cv2.VideoCapture | None = None
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._buffer: deque[BufferFrame] = deque()
        self.state = CameraState()
        self._meters_fn = lambda: 0.0
        self._on_frame = None
        self.controls = {
            "exposure": -2,
            "gain": 64,
            "brightness": 0,
            "contrast": 50,
            "saturation": 64,
        }

    def set_meters_fn(self, fn) -> None:
        self._meters_fn = fn

    def set_on_frame(self, fn) -> None:
        self._on_frame = fn

    def list_cameras(self, max_index: int = 4) -> list[dict]:
        named = _named_devices()
        found = []
        if named:
            for item in named:
                kind = _camera_kind(item["name"])
                found.append(
                    {
                        "index": item["index"],
                        "label": _camera_label(item["name"], kind),
                        "name": item["name"],
                        "kind": kind,
                        "recommended": False,
                    }
                )
        else:
            for index in range(max_index):
                cap = _open_capture(index)
                if cap is None:
                    continue
                cap.release()
                found.append(
                    {
                        "index": index,
                        "label": f"Câmera {index}",
                        "name": f"camera-{index}",
                        "kind": "unknown",
                        "recommended": False,
                    }
                )
        if not found:
            return [{"index": 0, "label": "Câmera 0", "name": "camera-0", "kind": "unknown", "recommended": True}]
        best = max(found, key=lambda item: _camera_score(item["name"], item["kind"]))
        best["recommended"] = True
        return found

    def start(self, camera_index: int = 0) -> None:
        self.stop()
        name = _device_name(camera_index)
        if _camera_kind(name) == "virtual":
            raise RuntimeError(
                "Está selecionada a OBS Virtual Camera. "
                "Em Câmera e velocidade escolha 'ASUS FHD webcam'."
            )
        cap, frame = _open_working_capture(camera_index, self.controls)
        if cap is None or frame is None:
            raise RuntimeError(
                f"Não foi possível obter imagem da câmera {camera_index} ({name}). "
                "Feche o Windows Câmara, Zoom ou Teams e tente de novo."
            )

        width = int(frame.shape[1])
        height = int(frame.shape[0])
        fps = float(cap.get(cv2.CAP_PROP_FPS) or 30) or 30
        maxlen = max(15, int(BUFFER_SECONDS * max(fps, 15)))
        first_jpeg = _encode(frame, JPEG_QUALITY)

        with self._lock:
            self._cap = cap
            self._buffer = deque(maxlen=maxlen)
            self.state = CameraState(
                running=True,
                camera_index=camera_index,
                width=width,
                height=height,
                fps=fps,
                brightness=float(frame.mean()),
                latest_jpeg=first_jpeg,
            )
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2)
        with self._lock:
            if self._cap is not None:
                self._cap.release()
                self._cap = None
            self.state.running = False
            self.state.paused = False

    def set_controls(self, controls: dict[str, int]) -> dict[str, int]:
        normalized = {
            "exposure": max(-8, min(0, int(controls.get("exposure", self.controls["exposure"])))),
            "gain": max(0, min(128, int(controls.get("gain", self.controls["gain"])))),
            "brightness": max(0, min(64, int(controls.get("brightness", self.controls["brightness"])))),
            "contrast": max(0, min(100, int(controls.get("contrast", self.controls["contrast"])))),
            "saturation": max(0, min(100, int(controls.get("saturation", self.controls["saturation"])))),
        }
        self.controls = normalized
        with self._lock:
            cap = self._cap
        if cap is not None:
            _apply_controls(cap, normalized)
        return dict(normalized)

    def pause(self) -> list[BufferFrame]:
        with self._lock:
            self.state.paused = True
            self.state.frozen = list(self._buffer)
            self.state.selected_index = len(self.state.frozen) - 1
            return list(self.state.frozen)

    def resume(self) -> None:
        with self._lock:
            self.state.paused = False
            self.state.frozen = []
            self.state.selected_index = -1

    def select_frame(self, index: int) -> BufferFrame | None:
        with self._lock:
            if not self.state.frozen:
                return None
            index = max(0, min(index, len(self.state.frozen) - 1))
            self.state.selected_index = index
            frame = self.state.frozen[index]
            self.state.latest_jpeg = frame.jpeg
            return frame

    def get_selected_jpeg(self) -> bytes | None:
        with self._lock:
            if self.state.paused and self.state.frozen:
                idx = self.state.selected_index
                if 0 <= idx < len(self.state.frozen):
                    return self.state.frozen[idx].jpeg
            return self.state.latest_jpeg

    def snapshot(self) -> dict:
        with self._lock:
            return {
                "running": self.state.running,
                "paused": self.state.paused,
                "camera_index": self.state.camera_index,
                "fps": round(self.state.fps, 1),
                "width": self.state.width,
                "height": self.state.height,
                "brightness": round(self.state.brightness, 1),
                "controls": dict(self.controls),
                "error": self.state.error,
                "buffer_len": len(self.state.frozen if self.state.paused else self._buffer),
                "selected_index": self.state.selected_index,
                "has_frame": self.state.latest_jpeg is not None,
            }

    def _loop(self) -> None:
        last = time.perf_counter()
        frames = 0
        while not self._stop.is_set():
            with self._lock:
                cap = self._cap
                paused = self.state.paused
            if cap is None:
                break
            if paused:
                time.sleep(0.03)
                continue
            ok, frame = cap.read()
            if not ok or frame is None:
                time.sleep(0.02)
                continue
            meters = 0.0
            try:
                meters = float(self._meters_fn())
            except Exception:
                meters = 0.0

            jpeg = _encode(frame, JPEG_QUALITY)
            thumb = _encode(_thumb(frame), 70)
            item = BufferFrame(jpeg=jpeg, thumb=thumb, ts=time.time(), meters=meters)

            with self._lock:
                self._buffer.append(item)
                self.state.latest_jpeg = jpeg
                self.state.width = frame.shape[1]
                self.state.height = frame.shape[0]
                self.state.brightness = float(frame.mean())
                frames += 1
                now = time.perf_counter()
                if now - last >= 1:
                    self.state.fps = frames / (now - last)
                    frames = 0
                    last = now

            if self._on_frame is not None:
                try:
                    self._on_frame(frame, meters)
                except Exception:
                    pass

    def decode_selected(self) -> np.ndarray | None:
        jpeg = self.get_selected_jpeg()
        if not jpeg:
            return None
        arr = np.frombuffer(jpeg, dtype=np.uint8)
        return cv2.imdecode(arr, cv2.IMREAD_COLOR)


def _named_devices() -> list[dict]:
    try:
        from cv2_enumerate_cameras import enumerate_cameras
    except ImportError:
        return []
    devices = []
    seen = set()
    for info in enumerate_cameras(cv2.CAP_DSHOW):
        index = int(info.index) % 100
        if index in seen:
            continue
        seen.add(index)
        devices.append({"index": index, "name": str(info.name or f"Câmera {index}")})
    return devices


def _device_name(index: int) -> str:
    for item in _named_devices():
        if item["index"] == index:
            return item["name"]
    return f"Câmera {index}"


def _camera_kind(name: str) -> str:
    text = name.lower()
    if "obs" in text or "virtual" in text:
        return "virtual"
    if "ir " in text or text.endswith("ir") or "infrared" in text or "hello" in text:
        return "ir"
    return "rgb"


def _camera_label(name: str, kind: str) -> str:
    if kind == "virtual":
        return f"{name} · virtual (não é a webcam)"
    if kind == "ir":
        return f"{name} · IR (não usar)"
    return f"{name} · webcam"


def _camera_score(name: str, kind: str) -> float:
    if kind == "virtual":
        return -1000
    if kind == "ir":
        return -500
    text = name.lower()
    score = 10
    if "fhd" in text:
        score += 50
    if "asus" in text:
        score += 40
    if "webcam" in text:
        score += 20
    return score


def _sample_frame(cap: cv2.VideoCapture, reads: int = 6) -> np.ndarray | None:
    frame = None
    for _ in range(reads):
        ok, candidate = cap.read()
        if ok and candidate is not None:
            frame = candidate
    return frame


def _frame_has_image(frame: np.ndarray | None) -> bool:
    return frame is not None and float(frame.mean()) >= 5.0


def _apply_controls(cap: cv2.VideoCapture, controls: dict[str, int]) -> None:
    cap.set(cv2.CAP_PROP_AUTO_EXPOSURE, 0.25)
    cap.set(cv2.CAP_PROP_EXPOSURE, controls["exposure"])
    cap.set(cv2.CAP_PROP_GAIN, controls["gain"])
    cap.set(cv2.CAP_PROP_BRIGHTNESS, controls["brightness"])
    cap.set(cv2.CAP_PROP_CONTRAST, controls["contrast"])
    cap.set(cv2.CAP_PROP_SATURATION, controls["saturation"])
    cap.set(cv2.CAP_PROP_GAMMA, 300)


def _open_working_capture(
    index: int,
    controls: dict[str, int],
) -> tuple[cv2.VideoCapture | None, np.ndarray | None]:
    modes = (
        ("MJPG", TARGET_WIDTH, TARGET_HEIGHT),
        ("MJPG", 1280, 720),
        (None, TARGET_WIDTH, TARGET_HEIGHT),
        (None, 1280, 720),
        (None, 640, 480),
    )
    for backend in (cv2.CAP_DSHOW, cv2.CAP_MSMF):
        cap = cv2.VideoCapture(index, backend)
        if cap is None or not cap.isOpened():
            if cap is not None:
                cap.release()
            continue
        try:
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        except Exception:
            pass
        for fourcc, width, height in modes:
            if fourcc:
                cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*fourcc))
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
            cap.set(cv2.CAP_PROP_FPS, 30)
            frame = _sample_frame(cap)
            if _frame_has_image(frame):
                _apply_controls(cap, controls)
                tuned = _sample_frame(cap, 8)
                if _frame_has_image(tuned):
                    frame = tuned
                return cap, frame
        cap.release()
    return None, None


def _open_capture(index: int) -> cv2.VideoCapture | None:
    cap = cv2.VideoCapture(index, cv2.CAP_DSHOW)
    if cap is not None and cap.isOpened():
        return cap
    if cap is not None:
        cap.release()
    cap = cv2.VideoCapture(index)
    if cap is not None and cap.isOpened():
        return cap
    if cap is not None:
        cap.release()
    return None


def _encode(frame: np.ndarray, quality: int) -> bytes:
    ok, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not ok:
        raise RuntimeError("Falha ao compactar JPEG")
    return buf.tobytes()


def _thumb(frame: np.ndarray, width: int = 240) -> np.ndarray:
    h, w = frame.shape[:2]
    if w <= width:
        return frame
    scale = width / w
    return cv2.resize(frame, (width, max(1, int(h * scale))), interpolation=cv2.INTER_AREA)
