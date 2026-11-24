from __future__ import annotations

import time


class InspectionClock:
    def __init__(self) -> None:
        self.session_id: int | None = None
        self.sku_id: int | None = None
        self.speed_m_per_min: float = 1.0
        self.fov_width_cm: float = 15.0
        self.auto_good_sec: float = 0.0
        self._running_since: float | None = None
        self._accumulated = 0.0
        self._paused = False
        self.last_auto_good_at = 0.0

    def start(self, session_id: int, sku_id: int, speed: float, fov_cm: float, auto_good_sec: float) -> None:
        self.session_id = session_id
        self.sku_id = sku_id
        self.speed_m_per_min = speed
        self.fov_width_cm = fov_cm
        self.auto_good_sec = auto_good_sec
        self._accumulated = 0.0
        self._running_since = time.monotonic()
        self._paused = False
        self.last_auto_good_at = time.monotonic()

    def pause(self) -> None:
        if self._running_since is not None and not self._paused:
            self._accumulated += time.monotonic() - self._running_since
            self._running_since = None
        self._paused = True

    def resume(self) -> None:
        if self.session_id is None:
            return
        self._paused = False
        self._running_since = time.monotonic()

    def stop(self) -> float:
        meters = self.meters()
        self.session_id = None
        self.sku_id = None
        self._running_since = None
        self._paused = False
        return meters

    def meters(self) -> float:
        elapsed = self._accumulated
        if self._running_since is not None:
            elapsed += time.monotonic() - self._running_since
        return (self.speed_m_per_min / 60.0) * elapsed

    def mm_per_px(self, frame_width: int) -> float:
        if frame_width <= 0:
            return 0.0
        return (self.fov_width_cm * 10.0) / frame_width

    def min_defect_mm(self, frame_width: int, pixels: int = 3) -> float:
        return self.mm_per_px(frame_width) * pixels
