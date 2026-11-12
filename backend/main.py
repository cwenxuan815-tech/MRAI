"""FastAPI 应用入口。

启动方式（在 backend 目录下）：
    uvicorn main:app --reload --host 127.0.0.1 --port 8000
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

import config
from api import doctor, patient, report, websocket
from models.base import init_db

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("medical-report-mvp")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """启动时准备目录与数据表。"""
    config.ensure_dirs()
    init_db()
    if config.DIFY_MOCK:
        logger.warning(
            "当前为 DIFY_MOCK 模拟模式（scene=%s），不会真实调用 Dify",
            config.DIFY_MOCK_SCENARIO,
        )
    else:
        logger.info("Dify 真实调用模式，endpoint=%s", config.DIFY_ENDPOINT)
        logger.info(
            "Workflow 输入变量名: patient=%r file=%r extra=%s",
            config.DIFY_INPUT_PATIENT_KEY,
            config.DIFY_INPUT_FILE_KEY,
            config.DIFY_EXTRA_INPUTS or "无",
        )
    logger.info("上传目录: %s", config.UPLOAD_DIR)
    logger.info("数据库: %s", config.DATABASE_URL)
    yield
    logger.info("服务已停止")


app = FastAPI(
    title="医疗检查报告智能分析 MVP",
    description="患者上传检查报告 -> Dify Workflow 分析 -> 医护端实时接收与处置",
    version="1.0.0",
    lifespan=lifespan,
)

# MVP 阶段允许任意来源跨域，前端开发更省事
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 业务接口
app.include_router(report.router, prefix="/api")
app.include_router(patient.router, prefix="/api")
app.include_router(doctor.router, prefix="/api")

# WebSocket：/ws/doctor
app.include_router(websocket.router)

# 原始报告文件静态访问：/uploads/YYYYMMDD/xxx.pdf（医护端查看原始报告）
config.ensure_dirs()
app.mount("/uploads", StaticFiles(directory=str(config.UPLOAD_DIR)), name="uploads")


@app.get("/api/health", tags=["系统"], summary="健康检查")
def health():
    return {
        "status": "ok",
        "dify_mock": config.DIFY_MOCK,
        "dify_endpoint": config.DIFY_ENDPOINT,
    }
