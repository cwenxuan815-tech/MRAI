"""医护端接口：大屏统计、实时报警列表。"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from models.base import get_db
from schemas.schemas import AlertListItem, StatsResponse
from services import report_service

router = APIRouter(prefix="/doctor", tags=["医护端"])


@router.get(
    "/stats", response_model=StatsResponse, summary="大屏统计数据（统计卡 + 图表）"
)
def get_stats(db: Session = Depends(get_db)):
    return report_service.get_stats(db)


@router.get(
    "/alerts/latest",
    response_model=list[AlertListItem],
    summary="大屏实时报警列表（初始数据）",
)
def get_latest_alerts(
    limit: int = Query(default=20, ge=1, le=100), db: Session = Depends(get_db)
):
    return report_service.get_latest_alerts(db, limit)
