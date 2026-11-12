# 医疗检查报告智能分析系统 · 结构示意图

> 本文档用图解释系统「每个环节如何执行、模块之间如何依赖」，与代码一一对应。
> 阅读顺序建议：先看全景图建立整体印象，再看时序图理解数据流，最后看前后端依赖图深入细节。

---

## 一、系统全景架构图

```mermaid
flowchart TB
    subgraph Client["浏览器（同局域网访问 192.168.12.54:5173）"]
        P["患者端<br/>UploadPage / ResultPage / HistoryPage"]
        D["医护端<br/>DashboardPage / ReportListPage / ReportDetailPage"]
        AI["AI 健康助手<br/>PatientAIChat（iframe）"]
    end

    subgraph Frontend["前端 React 18 + TS + Vite"]
        API["api 层<br/>patient.ts / doctor.ts / client.ts"]
        HOOK["hooks/useDoctorSocket.ts"]
    end

    subgraph Backend["后端 FastAPI（0.0.0.0:8000）"]
        ROUTER["api 路由层<br/>report / patient / doctor / websocket"]
        SRV["services 业务层<br/>report_service / dify_client / ws_manager / mock_data"]
        MODEL["models + schemas<br/>ORM 模型 / Pydantic 校验"]
    end

    subgraph AI_SVC["Dify（192.168.12.54/v1）"]
        WF["Workflow 应用<br/>报告分析（/workflows/run）"]
        AGENT["Agent 应用<br/>AI 助手（/agent/...）"]
    end

    DB[("SQLite<br/>backend/database/app.db")]
    FS[("uploads/YYYYMMDD/<br/>原始报告文件")]

    P --> API
    D --> API
    D --> HOOK
    AI --> AGENT

    API -->|HTTP /api| ROUTER
    HOOK -->|WS /ws/doctor| ROUTER
    ROUTER --> SRV
    SRV --> MODEL
    SRV -->|上传文件 / 执行工作流| WF
    SRV --> DB
    SRV --> FS

    DB -.->|WebSocket 广播| HOOK

    classDef store fill:#f6ffed,stroke:#52c41a;
    classDef srv fill:#e6f4ff,stroke:#1677ff;
    class DB,FS store;
    class ROUTER,SRV,MODEL srv;
```

**关键依赖关系（从上到下）**

| 层 | 依赖什么 | 说明 |
| --- | --- | --- |
| 前端页面 | `api/*` + `hooks` | 页面只调接口层，不直接碰 HTTP/WS |
| `api/client.ts` | 后端 `/api` | axios 实例，由 Vite 代理到 `127.0.0.1:8000` |
| `useDoctorSocket.ts` | 后端 `/ws/doctor` | 原生 WebSocket，3s 重连 + 25s 心跳 |
| 后端路由层 | `services` | 路由只做参数校验和异常转换，业务全在 services |
| `report_service` | `dify_client` + `ws_manager` + `models` | 核心编排：落盘 → Dify → 落库 → 广播 |
| `dify_client` | Dify `Workflow` | 上传文件拿 file_id，再执行工作流 |
| `ws_manager` | 无外部依赖 | 进程内连接池单例，仅医护端 |
| `PatientAIChat` | Dify `Agent` | 纯前端 iframe，**不经过后端** |

---

## 二、核心业务流程时序图

### 2.1 患者上传报告 → AI 分析 → 实时推送

```mermaid
sequenceDiagram
    autonumber
    participant U as 患者端页面
    participant R as api/report.py
    participant S as report_service
    participant DF as dify_client
    participant DIFY as Dify Workflow
    participant DB as SQLite
    participant WS as ws_manager
    participant DOC as 医护端大屏

    U->>R: POST /api/reports/upload (patient_id + file)
    R->>R: 校验扩展名 / 大小 / 非空
    R->>S: create_report(db, patient_id, filename, content)

    S->>S: save_upload_file() 落盘到 uploads/YYYYMMDD/
    S->>DF: upload_file(file_path)
    DF->>DIFY: POST /files/upload
    DIFY-->>DF: file_id
    DF-->>S: file_id

    S->>DF: run_workflow(patient_id, file_id, filename)
    DF->>DIFY: POST /workflows/run (blocking)
    DIFY-->>DF: outputs（结构化 JSON）
    DF->>DF: _extract_report_payload() 兼容解析
    DF-->>S: payload dict

    S->>S: 归一化 level / alerts / 文本字段
    S->>DB: upsert patient + 写入 report_event + file_record
    DB-->>S: 提交成功

    S->>WS: broadcast({type: event_created, data})
    WS-->>DOC: 实时推送新报告（无需刷新）
    S-->>R: 返回 ReportDetail
    R-->>U: 展示分析结果
```

> 环节 6 的 `broadcast` 是异步推送，不阻塞接口返回；若当前无医护端在线，仅记录日志跳过（见 [ws_manager.py](backend/services/ws_manager.py)）。

### 2.2 医护处置报告 → 状态同步

```mermaid
sequenceDiagram
    autonumber
    participant DOC as 医护端详情页
    participant R as api/report.py
    participant S as report_service
    participant DB as SQLite
    participant WS as ws_manager
    participant DASH as 医护端大屏

    DOC->>R: POST /api/reports/{event_id}/process
    R->>R: 校验 remark 非空
    R->>S: process_report(db, event_id, remark, result)

    S->>DB: 查询报告
    alt 已是 processed
        S-->>R: 幂等返回，不重复写入/广播
    else 首次处置
        S->>DB: 更新 status=processed + 写入 treatment_record
        S->>WS: broadcast({type: report_processed})
        WS-->>DASH: 实时更新该行状态为「已处理」
        S-->>R: 返回 ReportDetail
    end
    R-->>DOC: 展示处置结果
```

---

## 三、后端模块依赖图

```mermaid
flowchart LR
    MAIN["main.py<br/>入口 / 路由注册 / 静态挂载"]
    CFG["config.py<br/>.env 读取"]

    subgraph API["api 路由层"]
        REPORT["report.py"]
        PATIENT["patient.py"]
        DOCTOR["doctor.py"]
        WSAPI["websocket.py"]
    end

    subgraph SVC["services 业务层"]
        REPORT_SVC["report_service.py"]
        DIFY["dify_client.py"]
        WSMGR["ws_manager.py"]
        MOCK["mock_data.py"]
    end

    subgraph DATA["数据层"]
        BASE["models/base.py<br/>engine / get_db / init_db"]
        MODELS["models/models.py<br/>4 张表"]
        SCHEMAS["schemas/schemas.py"]
    end

    MAIN --> API
    MAIN --> CFG
    MAIN -->|lifespan: init_db| BASE

    REPORT --> REPORT_SVC
    REPORT --> DIFY
    PATIENT --> REPORT_SVC
    DOCTOR --> REPORT_SVC
    WSAPI --> WSMGR

    REPORT_SVC --> DIFY
    REPORT_SVC --> WSMGR
    REPORT_SVC --> MODELS
    DIFY --> MOCK
    DIFY --> CFG
    WSMGR --> CFG
    REPORT_SVC --> CFG

    BASE --> MODELS
    BASE --> CFG
    REPORT --> SCHEMAS
    PATIENT --> SCHEMAS
    DOCTOR --> SCHEMAS

    classDef cfg fill:#fff7e6,stroke:#fa8c16;
    classDef api fill:#f9f0ff,stroke:#722ed1;
    classDef svc fill:#e6f4ff,stroke:#1677ff;
    classDef data fill:#f6ffed,stroke:#52c41a;
    class CFG cfg;
    class REPORT,PATIENT,DOCTOR,WSAPI api;
    class REPORT_SVC,DIFY,WSMGR,MOCK svc;
    class BASE,MODELS,SCHEMAS data;
```

**后端模块职责对照表**

| 文件 | 职责 | 依赖 |
| --- | --- | --- |
| [main.py](backend/main.py) | FastAPI 启动、注册 4 个路由、挂载 `/uploads`、lifespan 建表 | api、config、models.base |
| [config.py](backend/config.py) | 从 `.env` 读 Dify 参数、路径、上传限制 | 无 |
| [api/report.py](backend/api/report.py) | 上传/列表/详情/处置 4 个接口 | report_service、dify_client |
| [api/patient.py](backend/api/patient.py) | 患者信息、历史报告查询 | report_service |
| [api/doctor.py](backend/api/doctor.py) | 大屏统计、实时报警列表 | report_service |
| [api/websocket.py](backend/api/websocket.py) | `/ws/doctor` 连接与心跳 | ws_manager |
| [services/report_service.py](backend/services/report_service.py) | **核心**：落盘→Dify→归一化→落库→广播，以及查询/处置/统计 | dify_client、ws_manager、models |
| [services/dify_client.py](backend/services/dify_client.py) | Dify 文件上传 + 工作流调用 + 结果解析 | config、mock_data |
| [services/ws_manager.py](backend/services/ws_manager.py) | 进程内连接池，`broadcast` 广播 | config |
| [services/mock_data.py](backend/services/mock_data.py) | `DIFY_MOCK=true` 时的本地假数据 | config |
| [models/base.py](backend/models/base.py) | SQLAlchemy engine、会话、建表 | config |
| [models/models.py](backend/models/models.py) | patient / report_event / treatment_record / file_record | models.base |
| [schemas/schemas.py](backend/schemas/schemas.py) | Pydantic 请求/响应模型（`response_model` 校验） | 无 |

---

## 四、前端模块依赖图

```mermaid
flowchart LR
    ENTRY["main.tsx"] --> APP["App.tsx<br/>路由表"]

    APP --> PLAYOUT["PatientLayout"]
    APP --> DLAYOUT["DoctorLayout"]

    PLAYOUT --> UP["UploadPage"]
    PLAYOUT --> RES["ResultPage"]
    PLAYOUT --> HIS["HistoryPage"]

    DLAYOUT --> DASH["DashboardPage"]
    DLAYOUT --> LIST["ReportListPage"]
    DLAYOUT --> DETAIL["ReportDetailPage"]

    subgraph API_L["api 层"]
        PAPI["patient.ts<br/>（带 Mock 降级）"]
        DAPI["doctor.ts<br/>（无降级）"]
        HTTP["client.ts<br/>axios 实例"]
        MOCKDATA["mockData.ts"]
        MOCKSTORE["mockStore.ts"]
    end

    subgraph CORE["公共能力"]
        HOOK["hooks/useDoctorSocket.ts"]
        ECHART["components/EChart.tsx"]
        RISK["components/RiskTag.tsx"]
        AICHAT["components/PatientAIChat.tsx"]
        CONST["constants/medical.ts"]
        UTILS["utils/format.ts / storage.ts"]
    end

    UP --> PAPI
    UP --> AICHAT
    RES --> PAPI
    HIS --> PAPI

    DASH --> DAPI
    DASH --> HOOK
    DASH --> ECHART
    DASH --> RISK
    DASH --> CONST
    LIST --> DAPI
    DETAIL --> DAPI

    PAPI --> HTTP
    DAPI --> HTTP
    PAPI --> MOCKDATA
    PAPI --> MOCKSTORE

    AICHAT -.->|iframe 直连| DIFY["Dify Agent"]

    classDef page fill:#e6f4ff,stroke:#1677ff;
    classDef api fill:#f9f0ff,stroke:#722ed1;
    classDef core fill:#fff7e6,stroke:#fa8c16;
    class UP,RES,HIS,DASH,LIST,DETAIL page;
    class PAPI,DAPI,HTTP,MOCKDATA,MOCKSTORE api;
    class HOOK,ECHART,RISK,AICHAT,CONST,UTILS core;
```

**前端关键差异（务必注意）**

| 端 | api 层 | Mock 降级 | 原因 |
| --- | --- | --- | --- |
| 患者端 | [patient.ts](frontend/src/api/patient.ts) | **有**（后端不可用/5xx 时降级本地数据） | 保证患者端演示不中断 |
| 医护端 | [doctor.ts](frontend/src/api/doctor.ts) | **无**（失败如实报错） | 大屏与 WebSocket 依赖后端实时数据，无法用本地数据替代 |

**路由映射**

| 路径 | 页面 | 数据来源 |
| --- | --- | --- |
| `/patient/upload` | UploadPage | `uploadReport()` + `PatientAIChat`（iframe） |
| `/patient/result/:event_id` | ResultPage | `fetchReportDetail()` |
| `/patient/history/:patient_id` | HistoryPage | `fetchPatientReports()` |
| `/doctor/dashboard` | DashboardPage | `fetchDoctorStats()` + `fetchLatestAlerts()` + `useDoctorSocket` |
| `/doctor/reports` | ReportListPage | `fetchDoctorReports()` |
| `/doctor/report/:event_id` | ReportDetailPage | `fetchReportDetail()` + `submitProcess()` |

---

## 五、数据模型关系图（ER）

```mermaid
erDiagram
    PATIENT ||--o{ REPORT_EVENT : "patient_id（逻辑关联）"
    REPORT_EVENT ||--o{ FILE_RECORD : "event_id"
    REPORT_EVENT ||--o{ TREATMENT_RECORD : "event_id"

    PATIENT {
        int id PK
        string patient_id "唯一索引"
        string name
        string department
        string bed
        string doctor_name
        datetime created_at
        datetime updated_at
    }

    REPORT_EVENT {
        int id PK
        string event_id "唯一索引"
        string report_id
        string patient_id "索引"
        string patient_name
        string department
        string bed
        string doctor_id
        string doctor_name
        string nurse_id
        string overall_level "green/yellow/red"
        text summary
        text alerts "JSON 字符串"
        string status "pending/processed"
        datetime created_at "索引"
    }

    FILE_RECORD {
        int id PK
        string event_id "索引"
        string filename
        string filepath "相对 uploads 路径"
        datetime upload_time
    }

    TREATMENT_RECORD {
        int id PK
        string event_id "索引"
        text remark
        string result
        datetime created_at
    }
```

> 说明：SQLite 模型**未声明物理外键**，关联关系靠 `event_id` / `patient_id` 字符串 + 索引维护（见 [models.py](backend/models/models.py)），保证写入顺序灵活、避免外键约束导致的失败。

---

## 六、系统字段流转（一条数据如何从 AI 走到前端）

```mermaid
flowchart LR
    A["Dify Workflow outputs<br/>（LLM 生成，格式不稳定）"]
    B["dify_client<br/>_extract_report_payload"]
    C["report_service<br/>归一化"]
    D["SQLite report_event"]
    E["schemas<br/>Pydantic 校验"]
    F["前端页面"]

    A -->|"兼容 代码块/嵌套/宽松匹配"| B
    B -->|"补齐缺省字段"| C
    C -->|"level 转小写枚举、alerts 转文本、event_id 去重"| D
    D -->|"_parse_alerts 读取兜底"| E
    E -->|"response_model"| F
```

三个防错关键点（对应历史踩坑）：

1. **字段归一化**：`_to_text()` 把 Dify 可能返回的数组/对象转文本，防止 Pydantic 校验失败（500）。
2. **event_id 去重**：Dify 可能重复返回同一 event_id，撞库时退回后端生成的 `EVT...`。
3. **created_at 后置**：时间戳由后端 `datetime.now()` 生成，杜绝 AI 幻觉日期破坏排序和统计。

---

## 七、WebSocket 消息协议

| 方向 | type | 触发时机 | 负载 |
| --- | --- | --- | --- |
| 服务端 → 客户端 | `connected` | 连接建立 | `{connections: N}` |
| 服务端 → 客户端 | `event_created` | 新报告落库后 | 完整 ReportDetail |
| 服务端 → 客户端 | `report_processed` | 医护处置后 | `{event_id, status}` |
| 服务端 → 客户端 | `pong` | 响应心跳 | - |
| 客户端 → 服务端 | `ping` | 每 25s 心跳 | - |

---

## 八、运行依赖总览

```mermaid
flowchart TB
    START["start.bat"]
    START --> BE["后端<br/>.venv/python -m uvicorn main:app --port 8000 --reload"]
    START --> FE["前端<br/>.tools/node 运行 vite --port 5173"]

    BE --> ENV[".env 配置<br/>DIFY_API_KEY / ENDPOINT / 变量名 / MOCK"]
    BE --> DIFY2["Dify Workflow<br/>（报告分析）"]
    BE --> DB2["SQLite"]
    FE --> PROXY["Vite 代理<br/>/api /uploads /ws → 127.0.0.1:8000"]
    FE --> AGENT2["Dify Agent<br/>（AI 助手 iframe）"]

    classDef store fill:#f6ffed,stroke:#52c41a;
    classDef cfg fill:#fff7e6,stroke:#fa8c16;
    class DB2 store;
    class ENV,PROXY cfg;
```

**启动顺序**：`start.bat` 同时拉起前后端（各自一个窗口，端口占用则自动跳过）。
**停止方式**：`stop.bat` 按「窗口标题 → 命令行 → 端口」三重清理。

> 完整的环境配置与接口清单见 [README.md](README.md)；逐文件级技术细节见 [PROJECT_TECHNICAL_DOCUMENT.md](PROJECT_TECHNICAL_DOCUMENT.md)。
