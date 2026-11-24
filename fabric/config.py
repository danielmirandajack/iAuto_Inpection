from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
SAMPLES_DIR = DATA_DIR / "samples"
MODELS_DIR = DATA_DIR / "models"
YOLO_DIR = DATA_DIR / "yolo"
DB_PATH = DATA_DIR / "fabric.sqlite"
STATIC_DIR = ROOT / "static"

HOST = "127.0.0.1"
PORT = 8765

JPEG_QUALITY = 85
BUFFER_SECONDS = 2.5
TARGET_WIDTH = 1920
TARGET_HEIGHT = 1080
STREAM_FPS = 20
DEFAULT_EXPOSURE_LEVEL = 40

DEFAULT_CLASSES = [
    ("bom", "Tecido bom", 1),
    ("fio_puxado", "Fio puxado", 0),
    ("defeito_trama", "Defeito na trama", 0),
    ("mancha", "Mancha", 0),
    ("furo", "Furo", 0),
    ("outro", "Outro defeito", 0),
]

DEFAULT_SKU_NAME = "padrao"
DEFAULT_SPEED_M_PER_MIN = 1.0
DEFAULT_FOV_WIDTH_CM = 15.0
DEFAULT_AUTO_GOOD_SEC = 0.0
DETECT_CONF = 0.25
TRAIN_EPOCHS = 60
FINETUNE_EPOCHS = 35
MIN_TRAIN_IMAGES = 12
MIN_SAMPLES_PER_CLASS = 4


def ensure_dirs() -> None:
    for path in (DATA_DIR, SAMPLES_DIR, MODELS_DIR, YOLO_DIR, STATIC_DIR):
        path.mkdir(parents=True, exist_ok=True)
