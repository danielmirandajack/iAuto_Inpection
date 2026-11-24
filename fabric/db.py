from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator

from config import DB_PATH, DEFAULT_CLASSES, DEFAULT_SKU_NAME, ensure_dirs


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    ensure_dirs()
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    ensure_dirs()
    with connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS skus (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                notes TEXT DEFAULT '',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS classes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                slug TEXT NOT NULL UNIQUE,
                label TEXT NOT NULL,
                is_good INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sku_id INTEGER NOT NULL,
                speed_m_per_min REAL NOT NULL,
                fov_width_cm REAL NOT NULL,
                started_at TEXT NOT NULL,
                ended_at TEXT,
                meters REAL NOT NULL DEFAULT 0,
                FOREIGN KEY (sku_id) REFERENCES skus(id)
            );

            CREATE TABLE IF NOT EXISTS samples (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sku_id INTEGER NOT NULL,
                class_id INTEGER NOT NULL,
                session_id INTEGER,
                image_path TEXT NOT NULL,
                crop_path TEXT,
                bbox_x REAL,
                bbox_y REAL,
                bbox_w REAL,
                bbox_h REAL,
                meters REAL,
                origin TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (sku_id) REFERENCES skus(id),
                FOREIGN KEY (class_id) REFERENCES classes(id),
                FOREIGN KEY (session_id) REFERENCES sessions(id)
            );

            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER,
                sku_id INTEGER,
                class_id INTEGER,
                confidence REAL,
                meters REAL,
                bbox_x REAL,
                bbox_y REAL,
                bbox_w REAL,
                bbox_h REAL,
                image_path TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(id)
            );

            CREATE INDEX IF NOT EXISTS idx_samples_sku ON samples(sku_id);
            CREATE INDEX IF NOT EXISTS idx_samples_class ON samples(class_id);
            """
        )
        for slug, label, is_good in DEFAULT_CLASSES:
            conn.execute(
                "INSERT OR IGNORE INTO classes (slug, label, is_good) VALUES (?, ?, ?)",
                (slug, label, is_good),
            )
        conn.execute(
            "INSERT OR IGNORE INTO skus (name, notes, created_at) VALUES (?, ?, ?)",
            (DEFAULT_SKU_NAME, "SKU inicial do piloto", utc_now()),
        )


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return dict(row)


def fetch_all(query: str, params: tuple = ()) -> list[dict[str, Any]]:
    with connect() as conn:
        return [dict(r) for r in conn.execute(query, params).fetchall()]


def fetch_one(query: str, params: tuple = ()) -> dict[str, Any] | None:
    with connect() as conn:
        return row_to_dict(conn.execute(query, params).fetchone())


def execute(query: str, params: tuple = ()) -> int:
    with connect() as conn:
        cur = conn.execute(query, params)
        return int(cur.lastrowid)


def list_skus() -> list[dict[str, Any]]:
    return fetch_all("SELECT * FROM skus ORDER BY name")


def _safe_sku_name(name: str) -> str:
    cleaned = "".join(ch if ch.isalnum() or ch in "-_" else "-" for ch in name.strip())
    cleaned = "-".join(part for part in cleaned.replace("_", "-").split("-") if part)
    return cleaned.lower()


def create_sku(name: str, notes: str = "") -> dict[str, Any]:
    safe = _safe_sku_name(name)
    if not safe:
        raise ValueError("Indique um nome para o tecido.")
    existing = fetch_one("SELECT * FROM skus WHERE name = ?", (safe,))
    if existing:
        raise ValueError(f"Já existe um tecido chamado '{safe}'. Use outro nome.")
    sku_id = execute(
        "INSERT INTO skus (name, notes, created_at) VALUES (?, ?, ?)",
        (safe, notes.strip(), utc_now()),
    )
    sku = fetch_one("SELECT * FROM skus WHERE id = ?", (sku_id,))
    assert sku is not None
    return sku


def list_fabrics() -> list[dict[str, Any]]:
    from config import MODELS_DIR

    rows = []
    for sku in list_skus():
        best = MODELS_DIR / sku["name"] / "best.pt"
        counts = sample_counts(sku["id"])
        rows.append(
            {
                **sku,
                "has_model": best.exists(),
                "model_id": f"{sku['name']}/best.pt" if best.exists() else None,
                "sample_total": sum(int(c["count"]) for c in counts),
                "counts": counts,
            }
        )
    return rows


def list_classes() -> list[dict[str, Any]]:
    return fetch_all("SELECT * FROM classes ORDER BY is_good DESC, id")


def get_class_by_slug(slug: str) -> dict[str, Any] | None:
    return fetch_one("SELECT * FROM classes WHERE slug = ?", (slug,))


def get_config() -> dict[str, str]:
    rows = fetch_all("SELECT key, value FROM config")
    return {r["key"]: r["value"] for r in rows}


def set_config(key: str, value: str) -> None:
    execute(
        "INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, str(value)),
    )


def start_session(sku_id: int, speed_m_per_min: float, fov_width_cm: float) -> dict[str, Any]:
    session_id = execute(
        """
        INSERT INTO sessions (sku_id, speed_m_per_min, fov_width_cm, started_at, meters)
        VALUES (?, ?, ?, ?, 0)
        """,
        (sku_id, speed_m_per_min, fov_width_cm, utc_now()),
    )
    session = fetch_one("SELECT * FROM sessions WHERE id = ?", (session_id,))
    assert session is not None
    return session


def end_session(session_id: int, meters: float) -> None:
    execute(
        "UPDATE sessions SET ended_at = ?, meters = ? WHERE id = ?",
        (utc_now(), meters, session_id),
    )


def insert_sample(
    sku_id: int,
    class_id: int,
    image_path: str,
    origin: str,
    session_id: int | None = None,
    crop_path: str | None = None,
    bbox: tuple[float, float, float, float] | None = None,
    meters: float | None = None,
) -> int:
    bx = by = bw = bh = None
    if bbox:
        bx, by, bw, bh = bbox
    return execute(
        """
        INSERT INTO samples (
            sku_id, class_id, session_id, image_path, crop_path,
            bbox_x, bbox_y, bbox_w, bbox_h, meters, origin, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (sku_id, class_id, session_id, image_path, crop_path, bx, by, bw, bh, meters, origin, utc_now()),
    )


def get_sample(sample_id: int) -> dict[str, Any] | None:
    return fetch_one(
        """
        SELECT s.*, c.slug AS class_slug, c.label AS class_label, k.name AS sku_name
        FROM samples s
        JOIN classes c ON c.id = s.class_id
        JOIN skus k ON k.id = s.sku_id
        WHERE s.id = ?
        """,
        (sample_id,),
    )


def delete_sample(sample_id: int) -> dict[str, Any] | None:
    sample = get_sample(sample_id)
    if sample is None:
        return None
    execute("DELETE FROM samples WHERE id = ?", (sample_id,))
    return sample


def list_samples(sku_id: int | None = None, limit: int = 80) -> list[dict[str, Any]]:
    if sku_id is None:
        return fetch_all(
            """
            SELECT s.*, c.slug AS class_slug, c.label AS class_label, k.name AS sku_name
            FROM samples s
            JOIN classes c ON c.id = s.class_id
            JOIN skus k ON k.id = s.sku_id
            ORDER BY s.id DESC
            LIMIT ?
            """,
            (limit,),
        )
    return fetch_all(
        """
        SELECT s.*, c.slug AS class_slug, c.label AS class_label, k.name AS sku_name
        FROM samples s
        JOIN classes c ON c.id = s.class_id
        JOIN skus k ON k.id = s.sku_id
        WHERE s.sku_id = ?
        ORDER BY s.id DESC
        LIMIT ?
        """,
        (sku_id, limit),
    )


def sample_counts(sku_id: int) -> list[dict[str, Any]]:
    return fetch_all(
        """
        SELECT c.slug, c.label, c.is_good, COUNT(s.id) AS count
        FROM classes c
        LEFT JOIN samples s ON s.class_id = c.id AND s.sku_id = ?
        GROUP BY c.id
        ORDER BY c.is_good DESC, c.id
        """,
        (sku_id,),
    )


def defect_samples_for_export(sku_id: int) -> list[dict[str, Any]]:
    return fetch_all(
        """
        SELECT s.*, c.slug AS class_slug
        FROM samples s
        JOIN classes c ON c.id = s.class_id
        WHERE s.sku_id = ? AND c.is_good = 0 AND s.bbox_x IS NOT NULL
        ORDER BY s.id
        """,
        (sku_id,),
    )


def good_samples_for_export(sku_id: int) -> list[dict[str, Any]]:
    return fetch_all(
        """
        SELECT s.*, c.slug AS class_slug
        FROM samples s
        JOIN classes c ON c.id = s.class_id
        WHERE s.sku_id = ? AND c.is_good = 1
        ORDER BY s.id
        """,
        (sku_id,),
    )


def clear_training(sku_id: int) -> dict[str, Any]:
    sku = fetch_one("SELECT * FROM skus WHERE id = ?", (sku_id,))
    if sku is None:
        raise ValueError("Tecido não encontrado")
    execute("DELETE FROM samples WHERE sku_id = ?", (sku_id,))
    execute("DELETE FROM events WHERE sku_id = ?", (sku_id,))
    return sku


def list_events(session_id: int | None = None, limit: int = 20) -> list[dict[str, Any]]:
    if session_id is None:
        return fetch_all(
            """
            SELECT e.*, c.slug AS class_slug, c.label AS class_label
            FROM events e
            LEFT JOIN classes c ON c.id = e.class_id
            ORDER BY e.id DESC
            LIMIT ?
            """,
            (limit,),
        )
    return fetch_all(
        """
        SELECT e.*, c.slug AS class_slug, c.label AS class_label
        FROM events e
        LEFT JOIN classes c ON c.id = e.class_id
        WHERE e.session_id = ?
        ORDER BY e.id DESC
        LIMIT ?
        """,
        (session_id, limit),
    )


def insert_event(
    sku_id: int,
    class_id: int | None,
    confidence: float,
    meters: float,
    bbox: tuple[float, float, float, float] | None,
    session_id: int | None = None,
    image_path: str | None = None,
) -> int:
    bx = by = bw = bh = None
    if bbox:
        bx, by, bw, bh = bbox
    return execute(
        """
        INSERT INTO events (
            session_id, sku_id, class_id, confidence, meters,
            bbox_x, bbox_y, bbox_w, bbox_h, image_path, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (session_id, sku_id, class_id, confidence, meters, bx, by, bw, bh, image_path, utc_now()),
    )
