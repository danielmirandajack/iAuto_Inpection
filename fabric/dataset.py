from __future__ import annotations

import random
import shutil
from collections import defaultdict
from datetime import datetime

from config import (
    DATA_DIR,
    DEFAULT_CLASSES,
    MIN_SAMPLES_PER_CLASS,
    MIN_TRAIN_IMAGES,
    MODELS_DIR,
    YOLO_DIR,
    ensure_dirs,
)
from db import defect_samples_for_export, good_samples_for_export
from store import resolve_path


def class_counts(defects: list[dict]) -> dict[str, int]:
    counts: dict[str, int] = defaultdict(int)
    for sample in defects:
        counts[sample["class_slug"]] += 1
    return dict(counts)


def ordered_class_names(defects: list[dict]) -> dict[int, str]:
    present = {sample["class_slug"] for sample in defects}
    order = [slug for slug, _label, is_good in DEFAULT_CLASSES if not is_good and slug in present]
    for slug in present:
        if slug not in order:
            order.append(slug)
    return {index: slug for index, slug in enumerate(order)}


def export_yolo_dataset(sku_id: int, sku_name: str, val_ratio: float = 0.2) -> dict:
    ensure_dirs()
    defects = defect_samples_for_export(sku_id)
    if len(defects) < MIN_SAMPLES_PER_CLASS:
        raise ValueError(
            f"Precisa de pelo menos {MIN_SAMPLES_PER_CLASS} defeitos com caixa neste tecido."
        )

    counts = class_counts(defects)
    weak = [
        f"'{slug}' ({n}/{MIN_SAMPLES_PER_CLASS})"
        for slug, n in counts.items()
        if n < MIN_SAMPLES_PER_CLASS
    ]
    if weak:
        raise ValueError(
            "Cada tipo de defeito precisa de pelo menos "
            f"{MIN_SAMPLES_PER_CLASS} fotos com caixa. Ainda falta: {', '.join(weak)}."
        )

    names = ordered_class_names(defects)
    slug_to_id = {slug: index for index, slug in names.items()}

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out = YOLO_DIR / sku_name / stamp
    for split in ("train", "val"):
        (out / "images" / split).mkdir(parents=True, exist_ok=True)
        (out / "labels" / split).mkdir(parents=True, exist_ok=True)

    train_samples, val_samples = _split_stratified(defects, val_ratio)
    copied = 0
    copied += _write_split(out, "val", val_samples, slug_to_id, copies=1)
    copied += _write_balanced(out, "train", train_samples, slug_to_id)

    yaml_path = out / "dataset.yaml"
    names_yaml = "\n".join(f"  {i}: {name}" for i, name in names.items())
    yaml_path.write_text(
        f"path: {out.resolve().as_posix()}\n"
        f"train: images/train\n"
        f"val: images/val\n"
        f"names:\n{names_yaml}\n",
        encoding="utf-8",
    )

    good_dir = DATA_DIR / "good" / sku_name
    good_dir.mkdir(parents=True, exist_ok=True)
    good_copied = 0
    for sample in good_samples_for_export(sku_id):
        src = resolve_path(sample["image_path"])
        if src.exists():
            shutil.copyfile(src, good_dir / src.name)
            good_copied += 1

    weights_hint = MODELS_DIR / sku_name
    weights_hint.mkdir(parents=True, exist_ok=True)

    return {
        "dataset_yaml": str(yaml_path),
        "defect_images": copied,
        "train_images": len(list((out / "images" / "train").glob("*.jpg"))),
        "val_images": len(list((out / "images" / "val").glob("*.jpg"))),
        "good_images": good_copied,
        "classes": names,
        "class_counts": counts,
        "model_dir": str(weights_hint),
        "run_name": f"train_{stamp}",
        "small_set": len(defects) < 20,
        "unique_defects": len(defects),
    }


def _split_stratified(defects: list[dict], val_ratio: float) -> tuple[list[dict], list[dict]]:
    grouped: dict[str, list[dict]] = defaultdict(list)
    for sample in defects:
        grouped[sample["class_slug"]].append(sample)

    rng = random.Random(42)
    train: list[dict] = []
    val: list[dict] = []
    for items in grouped.values():
        pool = list(items)
        rng.shuffle(pool)
        if len(pool) == 1:
            train.extend(pool)
            continue
        n_val = max(1, int(len(pool) * val_ratio))
        n_val = min(n_val, len(pool) - 1)
        val.extend(pool[:n_val])
        train.extend(pool[n_val:])

    if not train:
        train, val = val, []
    return train, val


def _write_balanced(out, split: str, samples: list[dict], slug_to_id: dict[str, int]) -> int:
    grouped: dict[str, list[dict]] = defaultdict(list)
    for sample in samples:
        grouped[sample["class_slug"]].append(sample)
    copied = 0
    for items in grouped.values():
        copies = max(1, (MIN_TRAIN_IMAGES + len(items) - 1) // len(items))
        copied += _write_split(out, split, items, slug_to_id, copies)
    return copied


def _write_split(out, split: str, samples: list, slug_to_id: dict, copies: int) -> int:
    copied = 0
    for round_idx in range(copies):
        for sample in samples:
            src = resolve_path(sample["image_path"])
            if not src.exists():
                continue
            stem = f"{src.stem}_{round_idx:02d}"
            dest = out / "images" / split / f"{stem}.jpg"
            shutil.copyfile(src, dest)
            class_id = slug_to_id[sample["class_slug"]]
            xc = sample["bbox_x"] + sample["bbox_w"] / 2
            yc = sample["bbox_y"] + sample["bbox_h"] / 2
            label = f"{class_id} {xc:.6f} {yc:.6f} {sample['bbox_w']:.6f} {sample['bbox_h']:.6f}\n"
            (out / "labels" / split / f"{stem}.txt").write_text(label, encoding="utf-8")
            copied += 1
    return copied
