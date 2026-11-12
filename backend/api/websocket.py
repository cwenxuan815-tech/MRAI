"""WebSocket 接口：医护端实时接收新报告与处置状态变更。

消息格式（服务端 -> 客户端）：
    {"type": "connected",        "data": {"connections": 2}}
    {"type": "event_created",    "data": { ...报告详情... }}
    {"type": "report_processed", "data": {"event_id": "...", "status": "processed"}}
    {"type": "pong"}

消息格式（客户端 -> 服务端）：
    {"type": "ping"}   心跳保活
"""

import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from services.ws_manager import manager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["实时通信"])


@router.websocket("/ws/doctor")
async def doctor_websocket(websocket: WebSocket):
    """医护端实时通道：大屏监听报告推送。"""
    await manager.connect(websocket)
    try:
        await websocket.send_json(
            {"type": "connected", "data": {"connections": manager.count}}
        )
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if isinstance(message, dict) and message.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    except Exception as exc:  # noqa: BLE001  兜底：任何异常都清理连接，避免连接池泄漏
        logger.warning("医护端 WebSocket 异常: %s", exc)
    finally:
        await manager.disconnect(websocket)
