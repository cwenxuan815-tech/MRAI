"""患者相关接口。"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from models.base import get_db
from schemas.schemas import PatientResponse, ReportListResponse
from services import report_service

router = APIRouter(prefix="/patients", tags=["患者"])


@router.get("/{patient_id}", response_model=PatientResponse, summary="查询患者信息")
def get_patient(patient_id: str, db: Session = Depends(get_db)):
    patient = report_service.get_patient(db, patient_id)
    if patient is None:
        raise HTTPException(status_code=404, detail=f"患者不存在: {patient_id}，请先上传一次检查报告")
    return patient


@router.get("/{patient_id}/reports", response_model=ReportListResponse, summary="查询患者历史报告")
def get_patient_reports(
    patient_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    db: Session = Depends(get_db),
):
    return report_service.list_reports(db, patient_id=patient_id, page=page, page_size=page_size)
