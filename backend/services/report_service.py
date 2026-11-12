"""报告业务逻辑：文件落盘、Dify 编排、数据落库、统计聚合、处置更新、实时广播。"""

import json
import logging
from datetime import date, datetime, time, timedelta
from pathlib import Path
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session

import config
from models.models import FileRecord, Patient, ReportEvent, TreatmentRecord
from services import dify_client
from services.ws_manager import manager

logger = logging.getLogger(__name__)

# 异常提醒字段别名映射：兼容 Dify 输出的中英文键名
_ALERT_KEY_ALIASES: dict[str, tuple[str, ...]] = {
    "risk_type": ("risk_type", "type", "category", "风险类型", "类型"),
    "title": ("title", "name", "item", "指标", "标题"),
    "reason": ("reason", "detail", "description", "原因", "说明"),
    "suggestion": ("suggestion", "advice", "suggest", "建议"),
    "missing_data": ("missing_data", "missing", "缺失数据", "缺失项"),
    "level": ("level", "risk_level", "overall_level", "等级"),
}

VALID_LEVELS = {"green", "yellow", "red"}
VALID_STATUSES = {"pending", "processed"}


# ---------------- 通用工具 ----------------


def _normalize_level(value) -> str:
    level = str(value or "").strip().lower()
    return level if level in VALID_LEVELS else "green"


def _to_text(value) -> str:
    """把 Dify 可能返回的数组 / 对象等复合值转为可展示文本。

    LLM 输出的文本字段并不稳定，例如 missing_data 可能是 ["生化指标", "血常规"]，
    若原样透传会导致 Pydantic 响应校验失败（500）并让前端误降级到演示数据。
    """
    if value is None:
        return ""
    if isinstance(value, (list, tuple)):
        return "、".join(_to_text(item) for item in value if item not in (None, ""))
    if isinstance(value, dict):
        return "、".join(
            f"{key}: {_to_text(item)}"
            for key, item in value.items()
            if item not in (None, "")
        )
    return str(value)


def _normalize_status(value) -> str:
    status = str(value or "").strip().lower()
    return status if status in VALID_STATUSES else "pending"


def _normalize_alert(raw: dict, default_level: str) -> dict:
    """统一单条异常提醒的字段。"""
    normalized: dict = {}
    for target, aliases in _ALERT_KEY_ALIASES.items():
        value = None
        for alias in aliases:
            if isinstance(raw, dict) and raw.get(alias) not in (None, ""):
                value = raw[alias]
                break
        normalized[target] = value

    normalized["risk_type"] = _to_text(normalized["risk_type"]) or "未知类型"
    normalized["title"] = _to_text(normalized["title"]) or "未命名异常"
    normalized["reason"] = _to_text(normalized["reason"])
    normalized["suggestion"] = _to_text(normalized["suggestion"])
    normalized["missing_data"] = _to_text(normalized["missing_data"]) or "无"
    normalized["level"] = _normalize_level(normalized["level"] or default_level)
    return normalized


def _normalize_alerts(raw_alerts, overall_level: str) -> list[dict]:
    if not isinstance(raw_alerts, list):
        return []
    return [
        _normalize_alert(item, overall_level)
        for item in raw_alerts
        if isinstance(item, dict)
    ]


def _parse_alerts(raw_text: str | None) -> list[dict]:
    """解析告警 JSON 并对字段做文本归一化。

    历史数据可能在 `_to_text` 归一化加入前入库，导致 alerts 里出现 list/dict 字段
    （如 missing_data 为数组），直接透传会让 Pydantic 响应校验失败（500）。
    这里读取时统一兜底，确保每个字段都是可展示文本。
    """
    if not raw_text:
        return []
    try:
        data = json.loads(raw_text)
    except (json.JSONDecodeError, TypeError):
        return []
    if not isinstance(data, list):
        return []
    normalized: list[dict] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        normalized.append({key: _to_text(value) for key, value in item.items()})
    return normalized


# ---------------- 文件落盘 ----------------


def save_upload_file(filename: str, content: bytes) -> str:
    """保存上传文件到 uploads/YYYYMMDD/，返回相对路径。"""
    suffix = Path(filename).suffix.lower()
    day_dir = config.UPLOAD_DIR / date.today().strftime("%Y%m%d")
    day_dir.mkdir(parents=True, exist_ok=True)

    stored_name = f"{uuid4().hex}{suffix}"
    target = day_dir / stored_name
    target.write_bytes(content)

    # 统一使用 "/" 作为相对路径分隔符，便于拼 URL
    return target.relative_to(config.UPLOAD_DIR).as_posix()


# ---------------- 序列化 ----------------


def _serialize_report(row: ReportEvent) -> dict:
    return {
        "id": row.id,
        "event_id": row.event_id,
        "report_id": row.report_id,
        "patient_id": row.patient_id,
        "patient_name": row.patient_name,
        "department": row.department,
        "bed": row.bed,
        "doctor_id": row.doctor_id,
        "doctor_name": row.doctor_name,
        "nurse_id": row.nurse_id,
        "overall_level": row.overall_level,
        "summary": row.summary,
        "alerts": _parse_alerts(row.alerts),
        "status": row.status,
        "created_at": row.created_at.isoformat(timespec="seconds")
        if row.created_at
        else None,
    }


def _serialize_files(db: Session, event_id: str) -> list[dict]:
    rows = db.scalars(select(FileRecord).where(FileRecord.event_id == event_id)).all()
    return [
        {
            "id": row.id,
            "filename": row.filename,
            "path": row.filepath,
            "url": f"/uploads/{row.filepath}",
            "upload_time": row.upload_time.isoformat(timespec="seconds")
            if row.upload_time
            else None,
        }
        for row in rows
    ]


def _serialize_treatments(db: Session, event_id: str) -> list[dict]:
    rows = db.scalars(
        select(TreatmentRecord)
        .where(TreatmentRecord.event_id == event_id)
        .order_by(TreatmentRecord.created_at.desc())
    ).all()
    return [
        {
            "id": row.id,
            "remark": row.remark,
            "result": row.result,
            "created_at": row.created_at.isoformat(timespec="seconds")
            if row.created_at
            else None,
        }
        for row in rows
    ]


def _build_detail(db: Session, row: ReportEvent) -> dict:
    """组装报告详情：基础字段 + 原始文件 + 处置记录。"""
    detail = _serialize_report(row)
    detail["files"] = _serialize_files(db, row.event_id)
    detail["treatments"] = _serialize_treatments(db, row.event_id)
    return detail


# ---------------- 核心流程：上传 -> Dify -> 落库 -> 广播 ----------------


async def create_report(
    db: Session, patient_id: str, filename: str, content: bytes
) -> dict:
    """完整处理一次患者上传：真实调用 Dify Workflow 并保存结果。"""
    # 1. 文件落盘
    relative_path = save_upload_file(filename, content)
    file_path = config.UPLOAD_DIR / relative_path

    # 2. 调用 Dify：先上传文件拿 file_id，再执行 workflow
    file_id = await dify_client.upload_file(file_path)
    payload = await dify_client.run_workflow(patient_id, file_id, filename)

    # 文本字段统一转为字符串：Dify 可能返回数组，原样透传会让落库与响应校验失败
    for key in (
        "patient_name",
        "department",
        "bed",
        "doctor_id",
        "doctor_name",
        "nurse_id",
        "summary",
        "report_id",
    ):
        if key in payload:
            payload[key] = _to_text(payload[key])

    # 3. 归一化 Dify 结果
    overall_level = _normalize_level(payload.get("overall_level"))
    alerts = _normalize_alerts(payload.get("alerts"), overall_level)
    # event_id 是唯一键，而 Dify 可能重复返回同一个值（例如 Prompt 中固定了示例 ID），
    # 撞库会让整次上传失败，因此冲突时退回本地生成的唯一 ID。
    event_id = str(payload.get("event_id") or "").strip()
    if not event_id or db.scalar(
        select(ReportEvent).where(ReportEvent.event_id == event_id)
    ):
        event_id = f"EVT{uuid4().hex[:12].upper()}"
    report_id = str(
        payload.get("report_id")
        or f"RPT{datetime.now():%Y%m%d}{uuid4().hex[:4].upper()}"
    )
    # created_at 是系统字段，必须由后端生成当前时间，避免 Dify 返回历史/幻觉日期
    # 导致大屏统计卡（total_today）与列表排序失真，令实时推送看起来"未生效"。
    created_at = datetime.now()
    patient_name = payload.get("patient_name") or patient_id

    # 4. upsert 患者信息
    patient = db.scalar(select(Patient).where(Patient.patient_id == patient_id))
    if patient is None:
        patient = Patient(patient_id=patient_id)
        db.add(patient)
    patient.name = patient_name or patient.name
    patient.department = payload.get("department") or patient.department
    patient.bed = payload.get("bed") or patient.bed
    patient.doctor_name = payload.get("doctor_name") or patient.doctor_name

    # 5. 保存报告事件、文件记录
    report = ReportEvent(
        event_id=event_id,
        report_id=report_id,
        patient_id=patient_id,
        patient_name=patient_name,
        department=payload.get("department"),
        bed=payload.get("bed"),
        doctor_id=payload.get("doctor_id"),
        doctor_name=payload.get("doctor_name"),
        nurse_id=payload.get("nurse_id"),
        overall_level=overall_level,
        summary=payload.get("summary"),
        alerts=json.dumps(alerts, ensure_ascii=False),
        status=_normalize_status(payload.get("status")),
        created_at=created_at,
    )
    db.add(report)
    db.add(
        FileRecord(
            event_id=event_id,
            filename=filename,
            filepath=relative_path,
            upload_time=datetime.now(),
        )
    )
    db.commit()
    db.refresh(report)

    result = _serialize_report(report)
    result["files"] = _serialize_files(db, event_id)
    result["treatments"] = []

    # 6. 实时通知医护端
    await manager.broadcast({"type": "event_created", "data": result})
    logger.info("新报告已生成并广播: event_id=%s level=%s", event_id, overall_level)
    return result


# ---------------- 查询 ----------------


def get_report_detail(db: Session, event_id: str) -> dict | None:
    """按 event_id 查询报告详情（含原始文件与处理记录）。"""
    row = db.scalar(select(ReportEvent).where(ReportEvent.event_id == event_id))
    if row is None:
        return None
    return _build_detail(db, row)


def list_reports(
    db: Session,
    patient_id: str | None = None,
    level: str | None = None,
    status: str | None = None,
    page: int = 1,
    page_size: int = 10,
) -> dict:
    """分页查询报告列表，支持按 patient_id / 风险等级 / 状态筛选。"""
    conditions = []
    if patient_id:
        conditions.append(ReportEvent.patient_id == patient_id)
    if level and level in VALID_LEVELS:
        conditions.append(ReportEvent.overall_level == level)
    if status and status in VALID_STATUSES:
        conditions.append(ReportEvent.status == status)

    total = (
        db.scalar(select(func.count()).select_from(ReportEvent).where(*conditions)) or 0
    )
    rows = db.scalars(
        select(ReportEvent)
        .where(*conditions)
        .order_by(ReportEvent.created_at.desc(), ReportEvent.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [_serialize_report(row) for row in rows],
    }


def get_patient(db: Session, patient_id: str) -> dict | None:
    """查询患者信息。"""
    row = db.scalar(select(Patient).where(Patient.patient_id == patient_id))
    if row is None:
        return None
    return {
        "patient_id": row.patient_id,
        "name": row.name,
        "department": row.department,
        "bed": row.bed,
        "doctor_name": row.doctor_name,
        "updated_at": row.updated_at.isoformat(timespec="seconds")
        if row.updated_at
        else None,
    }


def get_latest_alerts(db: Session, limit: int = 20) -> list[dict]:
    """大屏初始报警列表：最近 N 条报告，reason 取第一条异常提醒的标题。"""
    rows = db.scalars(
        select(ReportEvent)
        .order_by(ReportEvent.created_at.desc(), ReportEvent.id.desc())
        .limit(limit)
    ).all()
    alerts = []
    for row in rows:
        alerts_list = _parse_alerts(row.alerts)
        alerts.append(
            {
                "event_id": row.event_id,
                "report_id": row.report_id,
                "patient_id": row.patient_id,
                "patient_name": row.patient_name,
                "department": row.department,
                "overall_level": row.overall_level,
                "reason": alerts_list[0]["title"]
                if alerts_list
                else (row.summary or "未见异常"),
                "status": row.status,
                "created_at": row.created_at.isoformat(timespec="seconds")
                if row.created_at
                else None,
            }
        )
    return alerts


# ---------------- 医护处置 ----------------


async def process_report(
    db: Session, event_id: str, remark: str, result: str
) -> dict | None:
    """医护确认处理：更新报告状态并写入处置记录。

    幂等保证：报告已是 processed 时，不新增处置记录、不重复广播，直接返回当前状态与已有处置记录。
    """
    row = db.scalar(select(ReportEvent).where(ReportEvent.event_id == event_id))
    if row is None:
        return None

    # 已处置：直接返回现有结果，避免重复写入与重复推送
    if row.status == "processed":
        logger.info("报告已处置，跳过重复处理: event_id=%s", event_id)
        return _build_detail(db, row)

    row.status = "processed"
    db.add(
        TreatmentRecord(
            event_id=event_id, remark=remark, result=result, created_at=datetime.now()
        )
    )
    db.commit()
    db.refresh(row)

    detail = _build_detail(db, row)

    await manager.broadcast(
        {
            "type": "report_processed",
            "data": {"event_id": event_id, "status": "processed"},
        }
    )
    logger.info("报告已处置: event_id=%s", event_id)
    return detail


# ---------------- 大屏统计 ----------------


def get_stats(db: Session) -> dict:
    """医护端大屏数据：统计卡 + 三张图表。"""
    today_start = datetime.combine(date.today(), time.min)

    total_today = (
        db.scalar(
            select(func.count())
            .select_from(ReportEvent)
            .where(ReportEvent.created_at >= today_start)
        )
        or 0
    )
    abnormal_today = (
        db.scalar(
            select(func.count())
            .select_from(ReportEvent)
            .where(
                ReportEvent.created_at >= today_start,
                ReportEvent.overall_level.in_(["yellow", "red"]),
            )
        )
        or 0
    )
    high_risk_patients = (
        db.scalar(
            select(func.count(func.distinct(ReportEvent.patient_id))).where(
                ReportEvent.created_at >= today_start,
                ReportEvent.overall_level == "red",
            )
        )
        or 0
    )
    pending_count = (
        db.scalar(
            select(func.count())
            .select_from(ReportEvent)
            .where(ReportEvent.status == "pending")
        )
        or 0
    )

    # 风险等级分布（累计）
    level_rows = db.execute(
        select(ReportEvent.overall_level, func.count()).group_by(
            ReportEvent.overall_level
        )
    ).all()
    level_map = {level: count for level, count in level_rows}
    level_distribution = [
        {"name": "正常", "value": level_map.get("green", 0), "level": "green"},
        {"name": "异常提醒", "value": level_map.get("yellow", 0), "level": "yellow"},
        {"name": "高风险", "value": level_map.get("red", 0), "level": "red"},
    ]

    # 科室报告统计（累计，取前 10）
    dept_rows = db.execute(
        select(ReportEvent.department, func.count())
        .group_by(ReportEvent.department)
        .order_by(func.count().desc())
        .limit(10)
    ).all()
    department_stats = [
        {"name": dept or "未知科室", "value": count} for dept, count in dept_rows
    ]

    # 最近 7 天趋势
    trend_start = datetime.combine(date.today() - timedelta(days=6), time.min)
    trend_rows = db.scalars(
        select(ReportEvent).where(ReportEvent.created_at >= trend_start)
    ).all()
    buckets: dict[str, dict] = {}
    for offset in range(7):
        day = (date.today() - timedelta(days=6 - offset)).strftime("%Y-%m-%d")
        buckets[day] = {"date": day, "total": 0, "abnormal": 0}
    for row in trend_rows:
        if not row.created_at:
            continue
        key = row.created_at.strftime("%Y-%m-%d")
        if key in buckets:
            buckets[key]["total"] += 1
            if row.overall_level in {"yellow", "red"}:
                buckets[key]["abnormal"] += 1

    return {
        "cards": {
            "total_today": total_today,
            "abnormal_today": abnormal_today,
            "high_risk_patients": high_risk_patients,
            "pending": pending_count,
        },
        "level_distribution": level_distribution,
        "department_stats": department_stats,
        "trend": list(buckets.values()),
    }
