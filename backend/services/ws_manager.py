"""WebSocket 连接管理。

MVP 采用后端进程内连接池（单进程广播），不引入 Redis。
仅服务医护端：患者上传报告后实时推送新报告；医护处理后推送状态变更。
"""

import asyncio
import logging

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """医护端 WebSocket 连接池。"""

    def __init__(self) -> None:
        self._connections: list[WebSocket] = []
        self._lock = asyncio.Lock()

    @property
    def count(self) -> int:
        return len(self._connections)

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections.append(websocket)
        logger.info("医护端已连接，当前连接数: %s", self.count)

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            if websocket in self._connections:
                self._connections.remove(websocket)
        logger.info("医护端已断开，当前连接数: %s", self.count)

    async def broadcast(self, message: dict) -> None:
        """向所有医护端连接广播消息，自动清理失效连接。"""
        async with self._lock:
            targets = list(self._connections)

        if not targets:
            logger.warning(
                "广播被跳过：当前无在线医护端连接（消息类型=%s）", message.get("type")
            )
            return

        dead: list[WebSocket] = []
        for websocket in targets:
            try:
                await websocket.send_json(message)
            except Exception:  # noqa: BLE001  连接已关闭等异常，直接剔除
                dead.append(websocket)

        if dead:
            async with self._lock:
                for websocket in dead:
                    if websocket in self._connections:
                        self._connections.remove(websocket)


# 全局单例：api/websocket.py 与 services/report_service.py 共用
manager = ConnectionManager()
