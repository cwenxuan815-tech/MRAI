"""Pydantic 数据模型：请求体与响应结构（同时用于 Swagger 文档）。"""

from pydantic import BaseModel, Field


class AlertItem(BaseModel):
    """单条异常提醒。"""

    risk_type: str = Field(description="风险类型")
    title: str = Field(description="标题")
    reason: str = Field(description="原因")
    suggestion: str = Field(description="建议")
    missing_data: str = Field(description="缺失数据")
    level: str = Field(description="该条提醒的风险等级 green/yellow/red")


class FileItem(BaseModel):
    """上传文件信息。"""

    id: int
    filename: str
    path: str
    url: str = Field(description="文件访问地址，用于医护端查看原始报告")
    upload_time: str | None = None


class TreatmentItem(BaseModel):
    """医护处置记录。"""

    id: int
    remark: str | None = None
    result: str | None = None
    created_at: str | None = None


class ReportItem(BaseModel):
    """报告事件（与 Dify 返回结构一致）。"""

    id: int
    event_id: str
    report_id: str | None = None
    patient_id: str
    patient_name: str | None = None
    department: str | None = None
    bed: str | None = None
    doctor_id: str | None = None
    doctor_name: str | None = None
    nurse_id: str | None = None
    overall_level: str = Field(description="风险等级 green/yellow/red")
    summary: str | None = None
    alerts: list[AlertItem] = []
    status: str = Field(description="状态 pending/processed")
    created_at: str | None = None


class ReportDetail(ReportItem):
    """报告详情：额外包含原始文件与处置记录。"""

    files: list[FileItem] = []
    treatments: list[TreatmentItem] = []


class ReportListResponse(BaseModel):
    """报告列表分页结果。"""

    total: int
    page: int
    page_size: int
    items: list[ReportItem]


class PatientResponse(BaseModel):
    """患者信息。"""

    patient_id: str
    name: str | None = None
    department: str | None = None
    bed: str | None = None
    doctor_name: str | None = None
    updated_at: str | None = None


class AlertListItem(BaseModel):
    """大屏实时报警条目。"""

    event_id: str
    report_id: str | None = None
    patient_id: str
    patient_name: str | None = None
    department: str | None = None
    overall_level: str
    reason: str
    status: str
    created_at: str | None = None


class StatsCards(BaseModel):
    total_today: int = Field(description="今日报告数量")
    abnormal_today: int = Field(description="异常报告数量")
    high_risk_patients: int = Field(description="高风险患者数量")
    pending: int = Field(description="待处理数量")


class StatsResponse(BaseModel):
    """大屏统计数据。"""

    cards: StatsCards
    level_distribution: list[dict]
    department_stats: list[dict]
    trend: list[dict]


class ProcessRequest(BaseModel):
    """医护处置请求。"""

    remark: str = Field(default="", description="处理说明")
    result: str = Field(default="", description="处理结果")
