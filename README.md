# EVP：医疗检查报告智能分析与辅助决策平台

[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.141-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Node](https://img.shields.io/badge/Node-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![Dify](https://img.shields.io/badge/Dify-Workflow-1C64F2)](https://dify.ai/)

这是一个面向「患者上传检查报告 → AI 自动分析 → 医护实时处置」闭环的医疗报告辅助分析项目。患者端上传血常规、生化等检查报告图片，后端调用 Dify Workflow 完成多模态解析，把结果归一化为结构化数据落库，再通过 WebSocket 实时推送到医护端监控大屏；医护端查看原始报告、提交处置意见后，患者端历史记录同步变为「已处理」。

> 项目采用代码与运行时资产分离的交付方式。上传的原始报告、SQLite 数据库、`.env` 密钥文件、虚拟环境与前端依赖均不随 Git 提交；仓库内只保留可复现的源码、配置模板与文档。

更完整的模块依赖与数据流说明见 [ARCHITECTURE.md](ARCHITECTURE.md)，逐文件级技术细节见 [PROJECT_TECHNICAL_DOCUMENT.md](PROJECT_TECHNICAL_DOCUMENT.md)。

## 导航

- [解决的问题](#解决的问题)
- [快速了解](#快速了解)
- [系统架构](#系统架构)
- [核心能力](#核心能力)
- [业务流程与数据链路](#业务流程与数据链路)
- [技术选型](#技术选型)
- [报告分析链路与结果归一化](#报告分析链路与结果归一化)
- [接口服务](#接口服务)
- [项目结构与关键文件](#项目结构与关键文件)
- [环境准备与运行方式](#环境准备与运行方式)
- [快速开始](#快速开始)
- [配置说明](#配置说明)
- [使用示例](#使用示例)
- [部署与资产边界](#部署与资产边界)
- [常见问题](#常见问题)
- [许可证](#许可证)

## 解决的问题

- 检查报告（血常规、生化等）指标密集，人工逐项判读耗时长、易遗漏异常值；
- 患者拿到报告后缺少即时解读，只能看到「↑↓」箭头，无法判断严重程度；
- 医护端无法第一时间感知新报告与高危情况，异常信息依赖人工传递；
- AI 输出格式不稳定，字段类型漂移会直接击穿数据库写入与接口校验；
- 演示环境与真实环境混杂，容易把模拟数据当成真实分析结果；
- 报告图片、数据库与 API Key 容易误入 Git 仓库。

## 快速了解

| 业务需求或工程问题 | 解决方案 | 形成的交付能力 |
|---|---|---|
| 报告指标需要快速判读 | Dify Workflow 多模态分析 + 结构化输出 | 一次上传返回摘要、异常项与处置建议 |
| 异常严重程度难以量化 | 三级风险分级 green / yellow / red | 列表、大屏、详情统一按等级着色与筛选 |
| 医护端无法实时感知新报告 | 后端广播 + 前端 WebSocket 长连接 | 新报告免刷新进入大屏报警流 |
| AI 输出格式不稳定 | 归一化层 + Pydantic 校验 + 字段兜底 | 数组/对象转文本、事件 ID 去重、时间戳后置 |
| 无 Dify 环境也想演示 | `DIFY_MOCK` 本地模拟模式 | 不配 Key 即可跑通全链路，三档风险可复现 |
| 处置动作缺少留痕 | 处置记录表 + 状态机 | `pending → processed` 幂等流转，患者端可见 |
| 报告与密钥容易进入 Git | `.gitignore` 边界 + `.env.example` 模板 | 代码可公开，运行时产物与密钥不入库 |

项目的核心价值不是单次调用大模型，而是把「AI 分析能力」整理成可运行、可演示、可交接的工程闭环：上传契约、分析编排、结果归一化、风险分级、实时推送、处置留痕与历史查询都由明确模块负责。

## 系统架构

```text
离线侧
    └── Dify 平台
        ├── Workflow 应用：报告分析（/workflows/run，blocking）
        └── Agent 应用：AI 健康助手（WebApp，前端 iframe 直连）

在线链路
浏览器
  │  http://127.0.0.1:5173
  ▼
React 18 + TypeScript + Vite（frontend/）
  │  /api/*  /uploads/*  /ws/*（Vite 代理转发）
  ▼
FastAPI 应用（backend/，:8000）
  │  路由层只做参数校验与异常转换
  ▼
services/
  ├── report_service  ── 核心编排：落盘 → Dify → 归一化 → 落库 → 广播
  ├── dify_client     ── 文件上传 + 工作流调用 + 输出解析
  ├── ws_manager      ── 进程内连接池，医护端单例广播
  └── mock_data       ── DIFY_MOCK=true 时的三档模拟结果

旁路/支撑
  ├── SQLite：patient / report_event / treatment_record / file_record
  ├── uploads/YYYYMMDD/：原始报告文件（静态挂载 /uploads）
  └── schemas/：Pydantic 响应模型，作为前后端字段契约
```

后端不向前端暴露 Dify API Key，所有 AI 调用只发生在服务端进程内；患者端的 AI 健康助手是唯一例外，它以 iframe 方式直连 Dify Agent WebApp，不经过后端、不落库、不保存对话。

## 核心能力

| 模块 | 仓库状态 | 边界 |
|---|---|---|
| 报告上传与校验 | 已实现 | 仅 PNG / JPG / JPEG，单文件上限 20MB |
| Dify Workflow 分析 | 已实现 | 需自备 Dify 实例与 Workflow；变量名必须与编排一致 |
| 本地模拟模式 | 已实现 | green / yellow / red / auto 四档，输出结构与真实一致 |
| 结果归一化 | 已实现 | 风险等级枚举化、alerts 转文本、事件 ID 去重 |
| 患者端页面 | 已实现 | 上传 / 结果 / 历史三个页面 |
| 医护端页面 | 已实现 | 监控大屏 / 报告管理 / 报告详情 |
| 实时推送 | 已实现 | 进程内 WebSocket，单机单进程有效 |
| 大屏统计 | 已实现 | 统计卡 + 风险分布饼图 + 科室柱状图 + 7 天趋势 |
| 医护处置 | 已实现 | 幂等写入，患者端状态同步 |
| 账号与权限体系 | **未实现** | 无登录、无角色、无数据隔离 |
| 多实例部署 | **不支持** | 连接池与广播均在进程内存 |
| 生产级安全 | **未实现** | CORS 放开、无 HTTPS、无审计日志 |

### 当前状态与边界

- 当前定位是**本地/局域网演示型 MVP**，不是生产系统：无账号体系、无权限模型、无 Redis、无数据库迁移工具；
- CORS 在 MVP 阶段允许任意来源（`allow_origins=["*"]`），仅供开发联调，对外暴露前必须收敛；
- WebSocket 连接池保存在进程内，**多 Uvicorn worker 或多实例会导致广播分裂**，必须单进程运行；
- 上传仅接受图片：Dify 起始节点的文件变量只接受 image/audio，PDF 会在 Dify 侧被拒绝；
- 分析结论为 AI 生成的辅助参考，不构成诊断依据，页面均带免责提示；
- 数据仅存本地 SQLite，无备份、无清理策略。

## 业务流程与数据链路

### 输入契约

上传接口使用 `multipart/form-data`，两个字段均为必填：

| 字段 | 类型 | 约束 |
|---|---|---|
| `patient_id` | 文本 | 非空，去空格后校验；同一编号多次上传归入同一患者 |
| `file` | 文件 | 扩展名 `.png` / `.jpg` / `.jpeg`，内容非空，≤ 20MB |

文件按上传日期落盘为 `uploads/YYYYMMDD/<uuid>.<ext>`（用 UUID 重命名以避免重名与路径注入，原始文件名记录在 `file_record.filename`），通过 `/uploads/...` 静态访问，医护端详情页据此查看原图。

### 分析结果契约

Workflow 输出统一归一化为下列字段，与 `ReportItem` 响应模型一一对应：

| 字段 | 说明 |
|---|---|
| `event_id` | 本次分析事件 ID，后端保证唯一 |
| `report_id` | 报告编号（AI 返回，可为空） |
| `patient_id` / `patient_name` / `department` / `bed` | 患者与床位信息 |
| `doctor_id` / `doctor_name` / `nurse_id` | 责任医护信息 |
| `overall_level` | 总体风险等级：`green` / `yellow` / `red` |
| `summary` | 检查摘要（面向患者的自然语言解读） |
| `alerts[]` | 异常项列表，含 `risk_type` / `title` / `reason` / `suggestion` / `missing_data` / `level` |
| `status` | 处置状态：`pending` / `processed` |
| `created_at` | 分析时间，**由后端生成**，不采用 AI 返回值 |

### 风险分级与状态机

| 等级 | 含义 | 大屏表现 |
|---|---|---|
| `green` | 指标基本正常，`alerts` 为空 | 正常计数 |
| `yellow` | 单项异常，需短期复查 | 计入异常报告统计 |
| `red` | 多项高危或危急值，需立即处置 | 计入高风险患者去重计数 |

处置状态只允许 `pending → processed` 单向流转。对已处理报告重复提交处置请求时，服务层直接返回当前详情，不重复写入处置记录、不重复广播，保证幂等。

## 技术选型

| 层 | 选型 | 目的 |
|---|---|---|
| 后端框架 | FastAPI 0.141 | 自带 OpenAPI 文档，异步支持上传与 WebSocket |
| ORM | SQLAlchemy 2.0（`Mapped` 声明式） | 类型化模型，轻量迁移到其他数据库 |
| 数据库 | SQLite | 单文件、零部署，适合演示与交接 |
| AI 能力 | Dify Workflow / Agent | 报告解析编排与对话能力外置，避免在代码里拼 Prompt |
| 前端框架 | React 18 + TypeScript | 双端路由与类型约束 |
| 组件与图表 | Ant Design 5 + ECharts 5（按需引入） | 医护端 Pro 风格布局与统计图表 |
| 构建 | Vite 5 | 开发代理 `/api`、`/uploads`、`/ws`，免除跨域配置 |
| 实时通信 | 原生 WebSocket | 免引入额外依赖，3s 重连 + 25s 心跳 |

## 报告分析链路与结果归一化

### 调用链路

```text
POST /api/reports/upload
  → 校验扩展名 / 大小 / 非空
  → save_upload_file()                     落盘 uploads/YYYYMMDD/
  → dify_client.upload_file()              POST /files/upload → file_id
  → dify_client.run_workflow()             POST /workflows/run（blocking）
  → _extract_report_payload()              兼容代码块 / 嵌套 / 宽松匹配
  → report_service 归一化                   等级、alerts、文本字段
  → upsert patient + report_event + file_record
  → ws_manager.broadcast(event_created)    推送医护端大屏
  → 返回 ReportDetail                      患者端立即展示
```

广播是异步动作，不阻塞接口返回；当前无医护端在线时仅记录日志后跳过。

### 三个防错关键点

| 风险 | 处理方式 |
|---|---|
| AI 返回数组/对象导致 Pydantic 校验失败（500） | `_to_text()` 统一转文本后再落库 |
| AI 返回重复 `event_id` 撞唯一索引 | 撞库时退回后端生成的 `EVT...` 编号 |
| AI 幻觉日期破坏排序与统计 | `created_at` 一律由后端 `datetime.now()` 生成 |

### 模拟模式场景

`DIFY_MOCK=true` 时不请求 Dify，直接返回与真实结构一致的模拟结果，用于联调与现场演示。

| 取值 | 效果 |
|---|---|
| `green` | 正常报告，`alerts` 为空 |
| `yellow` | 单项异常（中性粒细胞绝对值降低） |
| `red` | 两项高危（血小板危急值、降钙素原升高） |
| `auto`（默认） | 取 `patient_id` 末位字符 ASCII 码 % 3：0=green、1=yellow、2=red |

`auto` 让连续编号的患者依次落在三档风险上，便于一次性演示全部状态；同一编号多次上传结果稳定。

## 接口服务

### 业务接口

| 方法 | 路径 | 功能 |
|---|---|---|
| `GET` | `/api/health` | 健康检查，返回当前是否处于模拟模式 |
| `POST` | `/api/reports/upload` | 上传报告并触发 AI 分析（form-data） |
| `GET` | `/api/reports` | 报告列表，支持 `patient_id` / `level` / `status` / `page` / `page_size` |
| `GET` | `/api/reports/{event_id}` | 报告详情，含原始文件与处置记录 |
| `POST` | `/api/reports/{event_id}/process` | 医护提交处置（`remark` + `result`） |
| `GET` | `/api/patients/{patient_id}` | 患者信息 |
| `GET` | `/api/patients/{patient_id}/reports` | 患者历史报告 |
| `GET` | `/api/doctor/stats` | 大屏统计卡 + 风险分布 / 科室统计 / 7 天趋势 |
| `GET` | `/api/doctor/alerts/latest?limit=20` | 大屏实时报警列表初始数据 |
| `WS` | `/ws/doctor` | 医护端实时通道 |
| `GET` | `/uploads/{YYYYMMDD}/{file}` | 原始报告文件静态访问 |

交互式接口文档：`http://127.0.0.1:8000/docs`。列表接口的 `page_size` 上限为 100，报警列表 `limit` 上限为 100。

### WebSocket 协议

| 方向 | type | 触发时机 | 负载 |
|---|---|---|---|
| 服务端 → 客户端 | `connected` | 连接建立 | `{connections: N}` |
| 服务端 → 客户端 | `event_created` | 新报告落库后 | 完整 ReportDetail |
| 服务端 → 客户端 | `report_processed` | 医护处置后 | `{event_id, status}` |
| 服务端 → 客户端 | `pong` | 响应心跳 | — |
| 客户端 → 服务端 | `ping` | 每 25s | — |

### 响应示例

上传成功（`POST /api/reports/upload`）：

```json
{
  "event_id": "EVT7A3F21",
  "report_id": "RPT20261112001",
  "patient_id": "P002",
  "patient_name": "翠花",
  "department": "血液科",
  "bed": "03床",
  "overall_level": "red",
  "summary": "本次检查发现 2 项高危异常指标（血小板危急值、降钙素原升高），存在出血与感染风险，需立即处置。",
  "alerts": [
    {
      "risk_type": "血液系统",
      "title": "血小板危急值",
      "reason": "血小板计数 32×10^9/L，显著低于参考范围 125-350×10^9/L",
      "suggestion": "立即通知主管医生，评估出血风险并准备血小板输注",
      "missing_data": "无",
      "level": "red"
    }
  ],
  "status": "pending",
  "created_at": "2026-11-12T16:20:31",
  "files": [{ "filename": "report.jpg", "url": "/uploads/20261112/3f2a9c7d4e1b4c8ea5d6f7b8c9d0e1f2.jpg" }],
  "treatments": []
}
```

## 项目结构与关键文件

```text
.
├── backend/                      FastAPI 后端
│   ├── main.py                   应用入口：路由注册、静态挂载、启动建表
│   ├── config.py                 .env 读取与路径/上传限制
│   ├── requirements.txt
│   ├── .env.example              配置模板（占位符，可提交）
│   ├── api/                      report / patient / doctor / websocket
│   ├── services/                 report_service / dify_client / ws_manager / mock_data
│   ├── models/                   base.py（engine/会话/建表）、models.py（四张表）
│   ├── schemas/                  Pydantic 请求与响应模型
│   └── database/                 app.db（运行时生成，不入库）
├── frontend/                     React 前端
│   ├── src/api/                  client / patient / doctor / mockData / mockStore
│   ├── src/components/           Layout / AlertCard / RiskTag / EChart / PatientAIChat
│   ├── src/pages/patient/        UploadPage / ResultPage / HistoryPage
│   ├── src/pages/doctor/         DashboardPage / ReportListPage / ReportDetailPage
│   ├── src/hooks/                useDoctorSocket.ts
│   ├── src/constants/            medical.ts（等级与状态文案映射）
│   └── vite.config.ts            开发代理（/api /uploads /ws）
├── uploads/                      原始报告文件（运行时生成，不入库）
├── .tools/node/                  便携版 Node（不入库）
├── start.bat / stop.bat          Windows 一键启停
├── ARCHITECTURE.md               架构与模块依赖
└── PROJECT_TECHNICAL_DOCUMENT.md 技术交接文档
```

| 文件 | 作用 |
|---|---|
| `backend/main.py` | 应用装配、CORS、静态挂载、lifespan 建表 |
| `backend/config.py` | 环境变量解析，Dify 变量名不设默认值 |
| `backend/services/report_service.py` | 核心编排：落盘 → 分析 → 归一化 → 落库 → 广播，以及查询/处置/统计 |
| `backend/services/dify_client.py` | 文件上传、工作流调用、输出兼容解析 |
| `backend/services/ws_manager.py` | 进程内连接池与广播单例 |
| `backend/models/models.py` | 四张表定义与索引 |
| `frontend/src/App.tsx` | 双端路由表 |
| `frontend/src/api/patient.ts` | 患者端接口封装，含降级逻辑 |
| `frontend/src/hooks/useDoctorSocket.ts` | WebSocket 重连与心跳 |
| `frontend/src/components/EChart.tsx` | ECharts 按需引入封装 |

## 环境准备与运行方式

### 前置条件

| 项 | 要求 |
|---|---|
| OS | Windows 10/11（一键脚本为 Windows 专属，前后端本体跨平台） |
| Python | 3.10+，本项目实测 3.14.7 |
| Node | 18+，本项目实测 24.21.0（便携版位于 `.tools/node`，不入库） |
| Dify | 可选。`DIFY_MOCK=true` 时无需真实实例 |
| 依赖 | `backend/requirements.txt`、`frontend/package.json` |

> 仓库不包含 `.venv`、`node_modules` 与 `.tools/node`。首次运行必须自行安装依赖，否则 `start.bat` 会因找不到 Python 解释器或 `node.exe` 直接报错退出。

### 版本约束

| 约束 | 原因 |
|---|---|
| Node ≥ 18 | Vite 5 的最低要求 |
| Python ≥ 3.10 | 代码使用 `str \| None` 联合类型注解 |
| 单 Uvicorn 进程 | 连接池与广播在进程内存，多 worker 会分裂 |

## 快速开始

### 1. 安装后端依赖

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
```

### 2. 安装前端依赖

```powershell
cd frontend
npm install --registry=https://registry.npmmirror.com
```

> 国内网络建议加镜像源；`package-lock.json` 已入库，可复现依赖树。

### 3. 选择运行模式

`backend/.env` 中 `DIFY_MOCK=true` 即可零配置跑通全流程，适合本地联调与演示；接入真实 Dify 时改为 `false` 并补齐下方三个必填项。

### 4. 启动

```powershell
# 一键启动（后端 :8000、前端 :5173，各占一个窗口，端口已占用则跳过）
.\start.bat

# 一键停止（按窗口标题 → 命令行 → 端口三重清理）
.\stop.bat
```

> `start` 是 cmd/PowerShell 的内置命令，必须写成 `.\start.bat` 或直接双击。

手动启动：

```powershell
# 后端
cd backend
.\.venv\Scripts\python.exe -m uvicorn main:app --reload --host 0.0.0.0 --port 8000

# 前端
cd frontend
npm run dev
```

默认访问地址：

| 页面 | 地址 |
|---|---|
| 患者端上传 | `http://127.0.0.1:5173/patient/upload` |
| 医护端大屏 | `http://127.0.0.1:5173/doctor/dashboard` |
| 医护端报告管理 | `http://127.0.0.1:5173/doctor/reports` |
| 接口文档 | `http://127.0.0.1:8000/docs` |
| 健康检查 | `http://127.0.0.1:8000/api/health` |

### 5. 局域网访问

前后端均监听 `0.0.0.0`，同网段设备直接访问 `http://<本机IP>:5173` 即可；前端通过 Vite 代理把 `/api`、`/uploads`、`/ws` 转发到 `127.0.0.1:8000`，无需额外配置跨域。若需放行 Windows 防火墙，只需开放 TCP 5173（前端）。

### 6. 联调核对清单

1. 上传一张图片，确认返回数据来自后端真实接口（页面无「本地演示数据」提示）；
2. 正常报告与异常报告各上传一次，确认等级着色正确；
3. 医护端大屏无需刷新即可收到新报告；
4. 提交处置后，患者端历史记录状态变为「已处理」；
5. 按 `patient_id` 查询历史记录，确认分页与总数正确。

## 配置说明

### 配置文件

| 文件 | 作用 | 是否入库 |
|---|---|---|
| `backend/.env` | 真实运行配置（含 API Key） | 否 |
| `backend/.env.example` | 配置模板，全为占位符 | 是 |
| `frontend/.env.local` | 前端 AI 助手地址 | 否 |
| `frontend/vite.config.ts` | 监听地址、端口、代理规则 | 是 |

### 后端环境变量

| 变量 | 作用 | 默认 |
|---|---|---|
| `DIFY_API_KEY` | Dify 应用 API Key，仅后端持有 | 空（真实模式必填） |
| `DIFY_ENDPOINT` | Dify API 地址，自建部署填实际地址 | `https://api.dify.ai/v1` |
| `DIFY_USER` | 调用时携带的用户标识 | `medical-report-mvp` |
| `DIFY_TIMEOUT` | 工作流请求超时（秒） | `180` |
| `DIFY_MOCK` | 是否使用本地模拟数据 | `false` |
| `DIFY_MOCK_SCENARIO` | `green` / `yellow` / `red` / `auto` | `auto` |
| `DIFY_INPUT_PATIENT_KEY` | Workflow 中患者编号的变量名 | 无默认值，真实模式必填 |
| `DIFY_INPUT_FILE_KEY` | Workflow 中报告文件的变量名 | 无默认值，真实模式必填 |
| `DIFY_INPUT_FILE_IS_LIST` | 文件变量是否为 `file-list` | `false` |
| `DIFY_EXTRA_INPUTS` | Workflow 其它固定输入（JSON 字符串） | 空 |
| `UPLOAD_DIR` | 上传目录 | `<项目根>/uploads` |
| `DATABASE_DIR` | 数据库目录 | `backend/database` |
| `DATABASE_URL` | 数据库连接串 | `sqlite:///backend/database/app.db` |
| `MAX_UPLOAD_SIZE` | 单文件大小上限（字节） | `20971520`（20MB） |

> 允许的扩展名固定为 `.png` / `.jpg` / `.jpeg`，不通过环境变量配置。
> 变量名不做默认假设：`DIFY_MOCK=false` 且未配置变量名时直接返回明确错误，避免用臆测字段发起请求。可用 `GET {DIFY_ENDPOINT}/parameters` 核对 Workflow 的真实输入定义，返回的 `user_input_form` 即起始节点输入。

### 前端环境变量

| 变量 | 作用 | 默认 |
|---|---|---|
| `VITE_DIFY_WEBAPP_URL` | 患者端 AI 健康助手 iframe 地址 | 空（未配置时仅显示提示卡片） |

前端不接触 `DIFY_API_KEY`；AI 助手以 iframe 直连，URL 中不含密钥。

## 使用示例

### 场景一：患者上传报告

1. 打开 `/patient/upload`，填写患者编号（如 `P001`），选择一张 PNG/JPG 报告图片；
2. 提交后跳转结果页，展示总体等级、摘要与异常项列表；
3. 若后端不可用或返回 5xx，页面降级为本地演示数据并在顶部明确提示来源；返回 4xx 时如实报错，不降级。

命令行等价调用：

```powershell
curl.exe -X POST http://127.0.0.1:8000/api/reports/upload `
  -F "patient_id=P001" `
  -F "file=@E:\samples\blood_report.jpg"
```

### 场景二：医护端实时接收与处置

1. 打开 `/doctor/dashboard`，大屏订阅 `/ws/doctor`，新报告免刷新插入报警流；
2. 在 `/doctor/reports` 按患者编号搜索，或按风险等级、处理状态筛选；
3. 进入详情页查看原始报告图片，填写处理说明与结果后提交；
4. 处置后大屏该行状态实时变为「已处理」，患者端历史页同步更新。

```powershell
curl.exe -X POST http://127.0.0.1:8000/api/reports/EVT7A3F21/process `
  -H "Content-Type: application/json" `
  -d '{\"remark\":\"已通知主管医生，安排血小板输注\",\"result\":\"已处置\"}'
```

### 场景三：三档风险一次演示

保持 `DIFY_MOCK_SCENARIO=auto`，依次上传 `P001`、`P002`、`P003`，结果会稳定落在 yellow / red / green 三档，覆盖正常、告警、高危全部界面状态。

### 场景四：接入真实 Dify

1. 在 Dify 中创建 Workflow，起始节点定义患者编号与文件两个输入变量；
2. 用 `GET {DIFY_ENDPOINT}/parameters` 核对变量名与文件变量类型；
3. 把变量名写入 `DIFY_INPUT_PATIENT_KEY` / `DIFY_INPUT_FILE_KEY`，按类型设置 `DIFY_INPUT_FILE_IS_LIST`；
4. 将 `DIFY_MOCK` 改为 `false`，填写 `DIFY_API_KEY` 与 `DIFY_ENDPOINT`；
5. **重启后端**——`--reload` 只监听 `.py` 文件，`.env` 仅在进程启动时读取一次。

## 部署与资产边界

| 资产 | 位置 | 是否入库 |
|---|---|---|
| 源码与配置模板 | `backend/`、`frontend/src`、`.env.example` | 是 |
| 文档 | `README.md`、`ARCHITECTURE.md`、`PROJECT_TECHNICAL_DOCUMENT.md` | 是 |
| API Key | `backend/.env` | 否 |
| AI 助手地址 | `frontend/.env.local` | 否 |
| 原始报告 | `uploads/` | 否（含患者信息） |
| 数据库 | `backend/database/app.db` | 否 |
| 虚拟环境 / 依赖 | `.venv/`、`node_modules/` | 否 |
| 便携版 Node | `.tools/` | 否（约 143MB） |

安全说明：本系统无认证与鉴权，任何能访问 5173/8000 端口的人都可以读写全部数据。仅限可信局域网或本机使用，请勿直接暴露到公网；如需对外提供服务，必须在前置反向代理上补充认证与访问控制。

## 常见问题

**Q1：`start.bat` 报 `Python venv not found`？**
尚未创建虚拟环境。按「快速开始」第 1 步执行 `python -m venv .venv` 并安装依赖。

**Q2：`start.bat` 报 `Portable Node not found`？**
一键脚本硬依赖 `.tools\node\node.exe`。二选一：把便携版 Node 放回该路径，或安装全局 Node 18+ 后手动 `npm run dev`，并相应修改 `start.bat` 中的 `NODE_DIR`。

**Q3：`stop.bat` 提示某端口「STILL in use」？**
该进程属于其它用户或提权会话，脚本不会仅凭端口强杀。关闭对应窗口，或以管理员身份重跑。

**Q4：上传 PDF 返回 400？**
当前只接受图片。Dify 起始节点的文件变量仅支持 image/audio，PDF 会在 Dify 侧被拒（400），因此上传层提前拦截。

**Q5：上传返回 502「AI 分析失败」？**
按顺序检查：`DIFY_API_KEY` 是否为空、`DIFY_ENDPOINT` 是否可达、两个输入变量名是否与 Workflow 定义完全一致、`DIFY_INPUT_FILE_IS_LIST` 是否与文件变量类型匹配。

**Q6：改了 `.env` 但没有生效？**
`--reload` 只监听 `.py` 文件。修改 `.env` 后必须手动重启后端进程。

**Q7：医护端大屏不推送新报告？**
确认后端已启动、`/ws/doctor` 连接成功（浏览器开发者工具 Network → WS 可见）；若经过其他反向代理，需显式转发 `Upgrade` 头。

**Q8：患者端页面顶部提示「本地演示数据」？**
说明后端不可用或返回 5xx，前端已降级到 localStorage 数据。恢复后端后刷新即可回到真实数据。医护端不做降级，失败会直接报错，以免用假数据误导。

**Q9：大屏统计数字和自己预期不符？**
统计卡为**今日**口径（今日报告数、今日异常数、今日高风险患者去重数、当前待处理数）；饼图与科室柱状图为**累计**口径；趋势图为最近 7 天。口径不同，数字天然不等。

**Q10：多开几个 Uvicorn worker 会怎样？**
不要这样做。连接池与广播在进程内存，多 worker 会导致部分医护端收不到推送；本系统按单进程设计。

**Q11：可以直接部署到公网吗？**
不可以。无认证、无权限、无 HTTPS、无审计，且 CORS 全放开。详见「部署与资产边界」。

## 许可证

仓库暂未添加开源许可证。公开发布前需确认代码、报告样例数据与 Dify 工作流编排的权属与授权范围；样例报告中不得包含真实患者信息。
