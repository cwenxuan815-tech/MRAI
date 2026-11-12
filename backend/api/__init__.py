"""api 包：路由注册入口。

各子模块只定义 router，统一在 main.py 中挂载。
"""

from api import doctor, patient, report, websocket

__all__ = ["doctor", "patient", "report", "websocket"]
