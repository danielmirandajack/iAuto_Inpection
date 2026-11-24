from pathlib import Path
import tempfile

import db
from session import InspectionClock


def test_db_counts():
    with tempfile.TemporaryDirectory() as td:
        db.DB_PATH = Path(td) / "fabric.sqlite"
        db.init_db()
        sku = db.create_sku("algodao-teste")
        classes = {c["slug"]: c for c in db.list_classes()}
        db.insert_sample(
            sku_id=sku["id"],
            class_id=classes["bom"]["id"],
            image_path="samples/x.jpg",
            origin="manual_pause",
            meters=0.12,
        )
        db.insert_sample(
            sku_id=sku["id"],
            class_id=classes["fio_puxado"]["id"],
            image_path="samples/y.jpg",
            origin="manual_pause",
            bbox=(0.1, 0.2, 0.3, 0.15),
            meters=0.4,
        )
        counts = {row["slug"]: row["count"] for row in db.sample_counts(sku["id"])}
        assert counts["bom"] == 1
        assert counts["fio_puxado"] == 1
        assert counts["mancha"] == 0


def test_samples_isolated_per_fabric():
    with tempfile.TemporaryDirectory() as td:
        db.DB_PATH = Path(td) / "fabric.sqlite"
        db.init_db()
        cotton = db.create_sku("Algodao Azul")
        denim = db.create_sku("Denim")
        assert cotton["name"] == "algodao-azul"
        classes = {c["slug"]: c for c in db.list_classes()}
        db.insert_sample(
            sku_id=cotton["id"],
            class_id=classes["fio_puxado"]["id"],
            image_path="samples/algodao-azul/fio.jpg",
            origin="manual_pause",
            bbox=(0.1, 0.1, 0.2, 0.2),
        )
        db.insert_sample(
            sku_id=denim["id"],
            class_id=classes["mancha"]["id"],
            image_path="samples/denim/mancha.jpg",
            origin="manual_pause",
            bbox=(0.2, 0.2, 0.2, 0.2),
        )
        cotton_counts = {row["slug"]: row["count"] for row in db.sample_counts(cotton["id"])}
        denim_counts = {row["slug"]: row["count"] for row in db.sample_counts(denim["id"])}
        assert cotton_counts["fio_puxado"] == 1
        assert cotton_counts["mancha"] == 0
        assert denim_counts["mancha"] == 1
        assert denim_counts["fio_puxado"] == 0
        assert db.defect_samples_for_export(cotton["id"])[0]["image_path"].startswith("samples/algodao-azul")
        assert db.defect_samples_for_export(denim["id"])[0]["image_path"].startswith("samples/denim")
        try:
            db.create_sku("Algodao Azul")
            raise AssertionError("nomes duplicados deveriam falhar")
        except ValueError:
            pass
        db.clear_training(cotton["id"])
        cotton_after = {row["slug"]: row["count"] for row in db.sample_counts(cotton["id"])}
        denim_after = {row["slug"]: row["count"] for row in db.sample_counts(denim["id"])}
        assert cotton_after["fio_puxado"] == 0
        assert denim_after["mancha"] == 1
        assert db.fetch_one("SELECT * FROM skus WHERE id = ?", (cotton["id"],))["name"] == "algodao-azul"


def test_delete_one_sample_keeps_the_rest():
    with tempfile.TemporaryDirectory() as td:
        db.DB_PATH = Path(td) / "fabric.sqlite"
        db.init_db()
        sku = db.create_sku("padrao-del")
        classes = {c["slug"]: c for c in db.list_classes()}
        first = db.insert_sample(
            sku_id=sku["id"],
            class_id=classes["fio_puxado"]["id"],
            image_path="samples/a.jpg",
            origin="manual_pause",
            bbox=(0.1, 0.1, 0.2, 0.2),
        )
        second = db.insert_sample(
            sku_id=sku["id"],
            class_id=classes["mancha"]["id"],
            image_path="samples/b.jpg",
            origin="manual_pause",
            bbox=(0.2, 0.2, 0.2, 0.2),
        )
        removed = db.delete_sample(first)
        assert removed is not None
        assert removed["id"] == first
        assert db.get_sample(first) is None
        leftover = db.get_sample(second)
        assert leftover is not None
        assert leftover["class_slug"] == "mancha"
        counts = {row["slug"]: row["count"] for row in db.sample_counts(sku["id"])}
        assert counts["fio_puxado"] == 0
        assert counts["mancha"] == 1
        assert db.delete_sample(99999) is None


def test_clock_pauses_meters():
    clock = InspectionClock()
    clock.start(session_id=1, sku_id=1, speed=60.0, fov_cm=15.0, auto_good_sec=0)
    clock._accumulated = 2.0
    clock._running_since = None
    clock._paused = True
    assert abs(clock.meters() - 2.0) < 1e-6
    clock.resume()
    clock.pause()
    assert clock.meters() >= 2.0


if __name__ == "__main__":
    test_db_counts()
    test_samples_isolated_per_fabric()
    test_delete_one_sample_keeps_the_rest()
    test_clock_pauses_meters()
    print("ok")
