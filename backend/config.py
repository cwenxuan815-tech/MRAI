"""全局配置：统一从 .env 读取。

说明：
1. Dify 的 API KEY 只存在于后端进程，前端永远拿不到，也不允许硬编码；
2. DIFY_MOCK=true 时不会真实请求 Dify，改为返回本地模拟数据，便于前端联调与演示。
"""

import json
import os
from pathlib import Path

from dotenv import load_dotenv

# backend 目录 与 项目根目录
BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent

# 载入 backend/.env（不存在时静默跳过，使用系统环境变量或默认值）
load_dotenv(BASE_DIR / ".env")


def _as_bool(value: str | None, default: bool = False) -> bool:
    """把字符串形式的开关解析成布尔值。"""
    if value is None or value == "":
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _as_json(value: str | None) -> dict:
    """把 JSON 字符串解析成字典，非法内容按空字典处理。"""
    if not value or not value.strip():
        return {}
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


# ---------------- Dify ----------------
DIFY_API_KEY: str = os.getenv("DIFY_API_KEY", "").strip()
DIFY_ENDPOINT: str = (
    os.getenv("DIFY_ENDPOINT", "https://api.dify.ai/v1").strip().rstrip("/")
)
DIFY_USER: str = os.getenv("DIFY_USER", "medical-report-mvp").strip()
DIFY_TIMEOUT: int = int(os.getenv("DIFY_TIMEOUT", "180"))

# 模拟模式开关与场景
DIFY_MOCK: bool = _as_bool(os.getenv("DIFY_MOCK"), False)
DIFY_MOCK_SCENARIO: str = os.getenv("DIFY_MOCK_SCENARIO", "auto").strip().lower()

# Workflow 输入变量名：必须与 Dify 编排中实际定义的变量名完全一致，因此不设默认值，
# 未配置时真实调用会直接报错提示，避免用臆测的字段名发起请求。
DIFY_INPUT_PATIENT_KEY: str = os.getenv("DIFY_INPUT_PATIENT_KEY", "").strip()
DIFY_INPUT_FILE_KEY: str = os.getenv("DIFY_INPUT_FILE_KEY", "").strip()
# 文件变量的类型：Dify 起始节点有 file（单文件）与 file-list（文件列表）两种，
# 选 file-list 时必须传数组，否则 Dify 会返回 "must be a list of files"。
DIFY_INPUT_FILE_IS_LIST: bool = _as_bool(os.getenv("DIFY_INPUT_FILE_IS_LIST"), False)
# Workflow 中除患者编号、报告文件之外的固定输入变量，JSON 字符串，如 {"hospital":"XX医院"}
DIFY_EXTRA_INPUTS: dict = _as_json(os.getenv("DIFY_EXTRA_INPUTS"))

# ---------------- 存储 ----------------
UPLOAD_DIR: Path = Path(os.getenv("UPLOAD_DIR") or (PROJECT_ROOT / "uploads"))
DATABASE_DIR: Path = Path(os.getenv("DATABASE_DIR") or (BASE_DIR / "database"))
DATABASE_URL: str = (
    os.getenv("DATABASE_URL") or f"sqlite:///{(DATABASE_DIR / 'app.db').as_posix()}"
)

# ---------------- 上传限制 ----------------
# 仅图片：Dify 起始节点的文件变量只接受 image/audio，PDF 会在 Dify 侧被拒（400）
ALLOWED_EXTENSIONS: set[str] = {".png", ".jpg", ".jpeg"}
MAX_UPLOAD_SIZE: int = int(os.getenv("MAX_UPLOAD_SIZE", str(20 * 1024 * 1024)))


def ensure_dirs() -> None:
    """确保上传目录与数据库目录存在。"""
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    DATABASE_DIR.mkdir(parents=True, exist_ok=True)
