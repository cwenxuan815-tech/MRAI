"""SQLite 数据模型：patient / report_event / treatment_record / file_record。

字段命名与 Dify Workflow 返回结构保持一致，便于直接映射落库。
"""

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base


def _now() -> datetime:
    return datetime.now()


class Patient(Base):
    """患者基础信息（由 Dify 返回结果中 upsert）。"""

    __tablename__ = "patient"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patient_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, comment="患者编号")
    name: Mapped[str | None] = mapped_column(String(64), comment="姓名")
    department: Mapped[str | None] = mapped_column(String(64), comment="科室")
    bed: Mapped[str | None] = mapped_column(String(32), comment="床位")
    doctor_name: Mapped[str | None] = mapped_column(String(64), comment="主治医生")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)


class ReportEvent(Base):
    """核心表：一次报告分析事件。"""

    __tablename__ = "report_event"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, comment="事件ID")
    report_id: Mapped[str | None] = mapped_column(String(64), index=True, comment="报告编号")
    patient_id: Mapped[str] = mapped_column(String(64), index=True, comment="患者编号")
    patient_name: Mapped[str | None] = mapped_column(String(64), comment="患者姓名")
    department: Mapped[str | None] = mapped_column(String(64), comment="科室")
    bed: Mapped[str | None] = mapped_column(String(32), comment="床位")
    doctor_id: Mapped[str | None] = mapped_column(String(64), comment="医生ID")
    doctor_name: Mapped[str | None] = mapped_column(String(64), comment="医生姓名")
    nurse_id: Mapped[str | None] = mapped_column(String(64), comment="护士ID")
    overall_level: Mapped[str] = mapped_column(String(16), default="green", index=True, comment="风险等级 green/yellow/red")
    summary: Mapped[str | None] = mapped_column(Text, comment="检查摘要")
    alerts: Mapped[str | None] = mapped_column(Text, comment="异常提醒列表（JSON 字符串）")
    status: Mapped[str] = mapped_column(String(16), default="pending", index=True, comment="状态 pending/processed")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, index=True, comment="分析时间")


class TreatmentRecord(Base):
    """医护处置记录。"""

    __tablename__ = "treatment_record"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_id: Mapped[str] = mapped_column(String(64), index=True, comment="关联的报告事件ID")
    remark: Mapped[str | None] = mapped_column(Text, comment="处理说明")
    result: Mapped[str | None] = mapped_column(String(64), comment="处理结果")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, comment="处理时间")


class FileRecord(Base):
    """上传文件记录。"""

    __tablename__ = "file_record"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_id: Mapped[str] = mapped_column(String(64), index=True, comment="关联的报告事件ID")
    filename: Mapped[str] = mapped_column(String(255), comment="原始文件名")
    filepath: Mapped[str] = mapped_column(String(512), comment="相对 uploads 目录的路径")
    upload_time: Mapped[datetime] = mapped_column(DateTime, default=_now, comment="上传时间")
