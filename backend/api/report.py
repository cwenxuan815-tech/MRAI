"""报告相关接口：上传分析、列表查询、详情查询、医护处置。"""

import logging
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

import config
from models.base import get_db
from schemas.schemas import ProcessRequest, ReportDetail, ReportListResponse
from services import dify_client, report_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reports", tags=["报告"])


@router.post(
    "/upload", response_model=ReportDetail, summary="上传检查报告并调用 Dify 分析"
)
async def upload_report(
    patient_id: str = Form(..., description="患者编号"),
    file: UploadFile = File(..., description="检查报告文件（PNG / JPG）"),
    db: Session = Depends(get_db),
):
    # 1. 参数校验
    patient_id = (patient_id or "").strip()
    if not patient_id:
        raise HTTPException(status_code=400, detail="患者编号不能为空")

    filename = file.filename or "unnamed"
    suffix = Path(filename).suffix.lower()
    if suffix not in config.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件类型 {suffix or '(无扩展名)'}，仅支持 PNG / JPG",
        )

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="上传文件内容为空")
    if len(content) > config.MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"文件过大，最大支持 {config.MAX_UPLOAD_SIZE // 1024 // 1024}MB",
        )

    # 2. 保存文件 -> 调用 Dify Workflow -> 落库 -> 广播
    try:
        return await report_service.create_report(db, patient_id, filename, content)
    except dify_client.DifyError as exc:
        logger.warning("Dify 调用失败: %s", exc)
        raise HTTPException(status_code=502, detail=f"AI 分析失败：{exc}") from exc


@router.get(
    "", response_model=ReportListResponse, summary="报告列表（支持患者/等级/状态筛选）"
)
def list_reports(
    patient_id: str | None = Query(default=None, description="患者编号"),
    level: str | None = Query(default=None, description="风险等级 green/yellow/red"),
    status: str | None = Query(default=None, description="状态 pending/processed"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    db: Session = Depends(get_db),
):
    return report_service.list_reports(db, patient_id, level, status, page, page_size)


@router.get("/{event_id}", response_model=ReportDetail, summary="报告详情")
def get_report(event_id: str, db: Session = Depends(get_db)):
    detail = report_service.get_report_detail(db, event_id)
    if detail is None:
        raise HTTPException(status_code=404, detail=f"报告不存在: {event_id}")
    return detail


@router.post(
    "/{event_id}/process", response_model=ReportDetail, summary="医护确认处理报告"
)
async def process_report(
    event_id: str, payload: ProcessRequest, db: Session = Depends(get_db)
):
    if not payload.remark.strip():
        raise HTTPException(status_code=400, detail="处理说明不能为空")

    detail = await report_service.process_report(
        db, event_id, payload.remark.strip(), payload.result.strip()
    )
    if detail is None:
        raise HTTPException(status_code=404, detail=f"报告不存在: {event_id}")
    return detail
