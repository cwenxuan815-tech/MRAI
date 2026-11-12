"""Dify Workflow 调用封装。

调用链路（与需求文档一致）：
    1) POST {DIFY_ENDPOINT}/files/upload   -> 取得 file_id
    2) POST {DIFY_ENDPOINT}/workflows/run  -> 取得结构化 JSON 结果

DIFY_MOCK=true 时跳过真实网络请求，直接返回 services/mock_data.py 的模拟结果。
"""

import json
import logging
import mimetypes
import re
from pathlib import Path
from typing import Any
from uuid import uuid4

import httpx

import config
from services import mock_data

logger = logging.getLogger(__name__)


class DifyError(Exception):
    """Dify 调用异常（网络失败、鉴权失败、业务失败等）。"""


# ---------------- 内部工具 ----------------


_REPORT_FIELD_WHITELIST = {
    "patient_id",
    "patient_name",
    "overall_level",
    "alerts",
    "summary",
    "report_id",
    "event_id",
    "department",
    "bed",
    "doctor_id",
    "doctor_name",
    "nurse_id",
    "treatments",
    "status",
    "created_at",
}


def _headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {config.DIFY_API_KEY}"}


def _guess_mime(filename: str) -> str:
    return mimetypes.guess_type(filename)[0] or "application/octet-stream"


def _dify_file_type(filename: str) -> str:
    """Dify 文件变量需要的 type：PDF 用 document，图片用 image。"""
    return (
        "image"
        if Path(filename).suffix.lower() in {".png", ".jpg", ".jpeg"}
        else "document"
    )


def _try_parse_json_text(text: str) -> Any:
    """从可能带 markdown / 前后脏字符的文本中解析 JSON。

    LLM 经常会把 JSON 包在 ```json 代码块里、或在前后加解释文字，
    这里按「代码块剥离 → 首尾 trim → 提取最外层 {…}」三层策略逐步尝试。
    """
    if not text:
        return None
    candidates: list[str] = []

    fence = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
    if fence:
        candidates.append(fence.group(1))
    candidates.append(text.strip())

    brace = re.search(r"\{[\s\S]*\}", text)
    if brace:
        candidates.append(brace.group(0))

    for raw in dict.fromkeys(candidates):
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            continue
    return None


def _is_report_like(d: dict) -> bool:
    return len(set(d.keys()) & _REPORT_FIELD_WHITELIST) >= 2


def _complete_report_payload(d: dict) -> dict:
    """补齐报告 payload 中缺失的关键字段，避免响应校验失败。

    仅当 dict 已经呈现"报告特征"时才调用；会把已知字段保留，
    未知字段也保留（便于落库时 JSON 存储）。
    """
    merged: dict[str, Any] = dict(d)
    merged.setdefault("patient_id", "")
    merged.setdefault("patient_name", "")
    merged.setdefault("overall_level", "unknown")
    alerts = merged.get("alerts")
    merged["alerts"] = alerts if isinstance(alerts, list) else []
    treatments = merged.get("treatments")
    merged["treatments"] = treatments if isinstance(treatments, list) else []
    merged.setdefault("summary", "")
    merged.setdefault("report_id", "")
    merged.setdefault("status", "pending")
    return merged


def _iter_any(node: Any):
    """深度优先遍历 JSON 树，产出所有 dict。"""
    if isinstance(node, dict):
        yield node
        for v in node.values():
            yield from _iter_any(v)
    elif isinstance(node, list):
        for item in node:
            yield from _iter_any(item)


def _extract_report_payload(outputs: Any) -> dict:
    """从 workflow 的 outputs 中提取结构化报告结果。

    兼容几种常见返回形式：
        - outputs 本身就是报告字段字典
        - outputs 下某个键（如 result / output / text）是 JSON 字符串
          （允许被 ```json 代码块包裹或前后夹杂说明文字）
        - outputs 下某个键是嵌套的报告字典

    严格路径未命中时，再做一轮宽松扫描：遍历 outputs 整棵 JSON 树，
    找到任意一个报告特征的 dict 后用默认字段补齐返回，尽量避免 502 让前端降级 mock。
    """
    if not isinstance(outputs, dict):
        raise DifyError(f"Dify 返回结果格式无法解析: {type(outputs).__name__}")

    if "patient_id" in outputs and ("overall_level" in outputs or "alerts" in outputs):
        return _complete_report_payload(outputs)

    for value in outputs.values():
        candidate: Any = value
        if isinstance(candidate, str):
            candidate = _try_parse_json_text(candidate)
        if isinstance(candidate, dict):
            try:
                return _extract_report_payload(candidate)
            except DifyError:
                continue
        if isinstance(candidate, list) and candidate and isinstance(candidate[0], dict):
            try:
                return _extract_report_payload(candidate[0])
            except DifyError:
                continue

    for node in _iter_any(outputs):
        if _is_report_like(node):
            logger.warning(
                "Dify outputs 未命中严格路径，已启用宽松匹配回填默认字段: keys=%s",
                sorted(set(node.keys()) & _REPORT_FIELD_WHITELIST),
            )
            return _complete_report_payload(node)

    raise DifyError(
        "Dify 返回结果中未找到结构化报告字段（patient_id / overall_level / alerts）"
    )


# ---------------- 对外接口 ----------------


async def upload_file(file_path: Path) -> str:
    """上传文件到 Dify，返回 file_id。"""
    if config.DIFY_MOCK:
        return f"mock-file-{uuid4().hex[:8]}"

    if not config.DIFY_API_KEY:
        raise DifyError(
            "未配置 DIFY_API_KEY，请在 backend/.env 中填写或开启 DIFY_MOCK=true"
        )

    url = f"{config.DIFY_ENDPOINT}/files/upload"
    files = {
        "file": (file_path.name, file_path.read_bytes(), _guess_mime(file_path.name))
    }
    data = {"user": config.DIFY_USER}

    try:
        async with httpx.AsyncClient(timeout=config.DIFY_TIMEOUT) as client:
            resp = await client.post(url, headers=_headers(), files=files, data=data)
    except httpx.HTTPError as exc:
        raise DifyError(f"上传文件到 Dify 失败: {exc}") from exc

    if resp.status_code >= 400:
        raise DifyError(f"上传文件到 Dify 失败({resp.status_code}): {resp.text[:300]}")

    payload = resp.json()
    file_id = payload.get("id")
    if not file_id:
        raise DifyError(f"Dify 未返回 file_id: {payload}")
    return str(file_id)


async def run_workflow(patient_id: str, file_id: str, filename: str) -> dict:
    """执行 Dify Workflow，返回结构化报告结果（dict）。"""
    if config.DIFY_MOCK:
        return mock_data.build_mock_payload(patient_id)

    if not config.DIFY_API_KEY:
        raise DifyError(
            "未配置 DIFY_API_KEY，请在 backend/.env 中填写或开启 DIFY_MOCK=true"
        )

    # 严格使用 .env 中配置的变量名，不做任何默认值假设
    if not config.DIFY_INPUT_PATIENT_KEY or not config.DIFY_INPUT_FILE_KEY:
        raise DifyError(
            "未配置 Workflow 输入变量名，请在 backend/.env 中填写 "
            "DIFY_INPUT_PATIENT_KEY 与 DIFY_INPUT_FILE_KEY（需与 Dify 编排中的变量名完全一致）"
        )

    file_value = {
        "type": _dify_file_type(filename),
        "transfer_method": "local_file",
        "upload_file_id": file_id,
    }
    inputs = {
        config.DIFY_INPUT_PATIENT_KEY: patient_id,
        # file-list 类型的变量必须传数组，单个 file 变量传对象
        config.DIFY_INPUT_FILE_KEY: (
            [file_value] if config.DIFY_INPUT_FILE_IS_LIST else file_value
        ),
        # Workflow 需要的其它固定输入（可选，来自 DIFY_EXTRA_INPUTS）
        **config.DIFY_EXTRA_INPUTS,
    }
    payload = {"inputs": inputs, "response_mode": "blocking", "user": config.DIFY_USER}
    url = f"{config.DIFY_ENDPOINT}/workflows/run"

    try:
        async with httpx.AsyncClient(timeout=config.DIFY_TIMEOUT) as client:
            resp = await client.post(
                url,
                headers={**_headers(), "Content-Type": "application/json"},
                json=payload,
            )
    except httpx.HTTPError as exc:
        raise DifyError(f"调用 Dify Workflow 失败: {exc}") from exc

    if resp.status_code >= 400:
        raise DifyError(
            f"调用 Dify Workflow 失败({resp.status_code}): {resp.text[:300]}"
        )

    body = resp.json()
    data = body.get("data") or {}
    status = data.get("status")
    # succeeded：全部节点成功；partial-succeeded：部分节点被跳过或走了失败兜底分支，
    # 但 Workflow 已结束并产出 outputs，结果仍可正常解析，因此不视为失败。
    if status and status not in {"succeeded", "partial-succeeded"}:
        raise DifyError(
            f"Dify Workflow 执行未成功: status={status}, error={data.get('error')}"
        )
    if status == "partial-succeeded":
        logger.warning(
            "Dify Workflow 部分节点未成功(partial-succeeded)，已按现有 outputs 继续解析"
        )

    return _extract_report_payload(data.get("outputs", {}))
