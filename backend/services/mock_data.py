"""DIFY_MOCK 模式使用的模拟数据。

仅用于本地开发与演示：不调用真实 Dify，直接产出与 Workflow 一致的 JSON 结构。
支持三种场景：
    green  -> 正常报告，alerts 为空
    yellow -> 单一异常指标提醒
    red    -> 多项高危指标
"""

from datetime import datetime
from uuid import uuid4

import config

# 模拟患者基础信息（可自行修改用于演示）
_MOCK_PATIENTS = [
    {"name": "黄新群", "department": "肿瘤科", "bed": "12床", "doctor_name": "张医生"},
    {"name": "翠花", "department": "血液科", "bed": "03床", "doctor_name": "李医生"},
    {"name": "王建国", "department": "呼吸内科", "bed": "21床", "doctor_name": "赵医生"},
]


def _pick_patient(patient_id: str) -> dict:
    """按 patient_id 稳定选取一位模拟患者，保证同一编号结果不变。"""
    return _MOCK_PATIENTS[sum(ord(c) for c in patient_id) % len(_MOCK_PATIENTS)]


def _resolve_scenario(patient_id: str) -> str:
    """确定本次模拟的风险场景。"""
    scenario = config.DIFY_MOCK_SCENARIO
    if scenario in {"green", "yellow", "red"}:
        return scenario
    # auto：取末位字符 ASCII 码 % 3，连续编号会依次落在 green/yellow/red 上，方便演示
    tail = patient_id.strip()[-1:] or "0"
    return ["green", "yellow", "red"][ord(tail) % 3]


# ---------------- 各场景的 alerts ----------------

_ALERTS_GREEN: list[dict] = []

_ALERTS_YELLOW: list[dict] = [
    {
        "risk_type": "血液系统",
        "title": "ANC 降低",
        "reason": "中性粒细胞绝对值 1.20×10^9/L，低于参考范围 1.80-6.30×10^9/L",
        "suggestion": "建议 24 小时内复查血常规，必要时咨询主管医生是否需要升白处理",
        "missing_data": "无",
        "level": "yellow",
    }
]

_ALERTS_RED: list[dict] = [
    {
        "risk_type": "血液系统",
        "title": "血小板危急值",
        "reason": "血小板计数 32×10^9/L，显著低于参考范围 125-350×10^9/L",
        "suggestion": "立即通知主管医生，评估出血风险并准备血小板输注",
        "missing_data": "无",
        "level": "red",
    },
    {
        "risk_type": "感染指标",
        "title": "降钙素原升高",
        "reason": "PCT 2.45 ng/mL，高于参考范围 0-0.05 ng/mL，提示存在感染",
        "suggestion": "建议完善血培养并评估抗感染方案",
        "missing_data": "血培养结果",
        "level": "red",
    },
]

_SUMMARIES = {
    "green": "本次检查各项指标基本处于参考范围内，未见明显异常，建议按计划复查。",
    "yellow": "本次检查发现 1 项指标轻度异常（中性粒细胞绝对值降低），整体风险可控，建议短期复查。",
    "red": "本次检查发现 2 项高危异常指标（血小板危急值、降钙素原升高），存在出血与感染风险，需立即处置。",
}


def build_mock_payload(patient_id: str) -> dict:
    """生成与 Dify Workflow 输出结构一致的模拟结果。"""
    scenario = _resolve_scenario(patient_id)
    patient = _pick_patient(patient_id)
    alerts = {"green": _ALERTS_GREEN, "yellow": _ALERTS_YELLOW, "red": _ALERTS_RED}[scenario]
    suffix = uuid4().hex[:6].upper()

    return {
        "event_id": f"EVT{suffix}",
        "report_id": f"RPT{datetime.now():%Y%m%d}{suffix[:4]}",
        "patient_id": patient_id,
        "patient_name": patient["name"],
        "department": patient["department"],
        "bed": patient["bed"],
        "doctor_id": "D1001",
        "doctor_name": patient["doctor_name"],
        "nurse_id": "N2001",
        "overall_level": scenario,
        "summary": _SUMMARIES[scenario],
        "alerts": alerts,
        "status": "pending",
        "created_at": datetime.now().isoformat(timespec="seconds"),
    }
