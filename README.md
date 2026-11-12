# 医疗检查报告智能分析 MVP

患者上传检查报告 → 后端调用 Dify Workflow 分析 → 患者查看结果 → 医护端实时接收并处置 → 历史记录查询。

- 技术栈：FastAPI + SQLAlchemy + SQLite + Dify Workflow（后端）/ React18 + TypeScript + Vite + Ant Design + ECharts（前端）
- 定位：MVP 演示版本，不含账号体系、权限体系、Redis 等企业级功能

## 目录结构

```
EVP/
├── backend                 # FastAPI 后端
│   ├── main.py             # 应用入口（路由注册、静态文件、启动建表）
│   ├── config.py           # .env 配置读取
│   ├── requirements.txt
│   ├── .env.example        # 配置模板（复制为 .env 使用）
│   ├── api/                # 接口层：report / patient / doctor / websocket
│   ├── services/           # 业务层：dify_client / report_service / ws_manager / mock_data
│   ├── models/             # SQLAlchemy 模型（patient / report_event / treatment_record / file_record）
│   ├── schemas/            # Pydantic 请求响应模型
│   └── database/           # SQLite 数据库文件（运行时生成）
├── frontend                # React 前端（患者端 /patient、医护端 /doctor）
├── uploads/                # 上传的原始报告文件（运行时生成）
├── .tools/node/            # 便携版 Node（免安装，供前端使用）
├── start.bat               # 一键启动前端 + 后端
├── stop.bat                # 一键关闭前端 + 后端
└── README.md
```

## 一键启停（推荐）

免去分别开两个终端，双击即可：

| 脚本        | 作用                                                                 |
| ----------- | -------------------------------------------------------------------- |
| `start.bat` | 启动后端（8000）与前端（5173），各占一个窗口；已运行的服务会自动跳过 |
| `stop.bat`  | 关闭上述两个窗口及其进程树，并校验端口是否已释放                     |

- 后端使用 `backend/.venv`，前端使用内置便携版 Node（`.tools/node`），均无需配置系统 PATH。
- 若在命令行里输入 `start` 不生效，是因为它是 cmd/PowerShell 的内置命令，请改用 `.\start.bat`，或直接双击脚本。
- `stop.bat` 若提示某端口「STILL in use」，说明该进程属于其它用户或提权会话，需关闭其窗口或以管理员身份重跑。

## 一、后端启动

```powershell
cd e:\EVP\backend

# 1. 创建虚拟环境并安装依赖（首次执行）
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt

# 2. 准备配置文件（首次执行）
Copy-Item .env.example .env

# 3. 启动服务（0.0.0.0 监听所有网卡，便于局域网访问）
.\.venv\Scripts\python.exe -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

- 接口文档：http://192.168.12.54:8000/docs
- 健康检查：http://192.168.12.54:8000/api/health
- 首次启动自动创建 `backend/database/app.db` 与 `uploads/` 目录

> 局域网访问：前后端均已监听 `0.0.0.0`，同局域网设备用本机 IP `192.168.12.54` 访问即可（本机仍可用 `127.0.0.1`）。若本机 IP 变化，请同步替换下文所有地址。

## 二、Dify 配置

`backend/.env`：

```ini
DIFY_API_KEY=app-xxxxxxxx           # Dify 应用 API Key（仅后端持有，前端不可见）
DIFY_ENDPOINT=https://api.dify.ai/v1 # 自建部署改为实际地址，如 http://127.0.0.1/v1
DIFY_INPUT_PATIENT_KEY=patient_id    # 必须与 Workflow 实际变量名一致（无默认值）
DIFY_INPUT_FILE_KEY=report_image     # 必须与 Workflow 实际变量名一致（无默认值）
DIFY_INPUT_FILE_IS_LIST=false        # 文件变量是 file-list 时填 true（取值必须为数组）
DIFY_EXTRA_INPUTS=                   # 可选，Workflow 其它固定输入，JSON 字符串
DIFY_MOCK=false                      # 接入真实 Workflow 时置为 false
```

变量名不做任何默认假设：`DIFY_MOCK=false` 且未配置变量名时会直接返回明确错误，避免用臆测字段发起请求。
变量名与文件变量类型可用 `GET {DIFY_ENDPOINT}/parameters` 核对，返回的 `user_input_form` 即 Workflow 起始节点的真实输入定义。

修改 `.env` 后必须重启后端：`--reload` 只监听 `.py` 文件，`.env` 仅在进程启动时读取一次。

调用链路：`POST /files/upload` 取 `file_id` → `POST /workflows/run`（`response_mode=blocking`）→ 解析 `data.outputs` 中的结构化报告 JSON。

返回结果字段与 Workflow 保持一致：`event_id / report_id / patient_id / patient_name / department / bed / doctor_id / doctor_name / nurse_id / overall_level / summary / alerts / status / created_at`。

## 三、Mock 模式（默认开启，便于演示）

`DIFY_MOCK=true` 时不请求 Dify，直接返回本地模拟数据，无需 API Key 即可跑通全流程。

`DIFY_MOCK_SCENARIO` 控制场景：

| 取值           | 效果                                                                    |
| -------------- | ----------------------------------------------------------------------- |
| `green`        | 正常报告，`alerts` 为空                                                 |
| `yellow`       | 单项异常（ANC 降低）                                                    |
| `red`          | 多项高危（血小板危急值、降钙素原升高）                                  |
| `auto`（默认） | 按 `patient_id` 末位字符自动切换，连续编号依次落在 green / yellow / red |

示例：`DIFY_MOCK_SCENARIO=auto` 时，`P001` → yellow，`P002` → red，`P003` → green。

## 四、接口清单

| 方法 | 路径                                 | 说明                                                                    |
| ---- | ------------------------------------ | ----------------------------------------------------------------------- |
| POST | `/api/reports/upload`                | 上传报告（form-data：`patient_id` + `file`），调用 Dify 并落库          |
| GET  | `/api/reports`                       | 报告列表，支持 `patient_id` / `level` / `status` / `page` / `page_size` |
| GET  | `/api/reports/{event_id}`            | 报告详情（含原始文件、处置记录）                                        |
| GET  | `/api/patients/{patient_id}`         | 患者信息                                                                |
| GET  | `/api/patients/{patient_id}/reports` | 患者历史报告                                                            |
| GET  | `/api/doctor/stats`                  | 大屏统计卡 + 风险分布 / 科室统计 / 7 天趋势                             |
| GET  | `/api/doctor/alerts/latest?limit=20` | 大屏实时报警列表（初始数据）                                            |
| POST | `/api/reports/{event_id}/process`    | 医护处置（`remark` + `result`），更新 `status=processed`                |
| WS   | `/ws/doctor`                         | 医护端实时通道                                                          |
| GET  | `/uploads/{YYYYMMDD}/{file}`         | 原始报告文件访问（供医护端查看）                                        |

WebSocket 消息：

```json
{ "type": "connected",        "data": { "connections": 1 } }
{ "type": "new_report",       "data": { "...报告详情..." } }
{ "type": "report_processed", "data": { "event_id": "EVTXXXX", "status": "processed" } }
{ "type": "pong" }
```

## 五、数据库

SQLite 文件位于 `backend/database/app.db`，共 4 张表：

| 表                 | 说明                                                                               |
| ------------------ | ---------------------------------------------------------------------------------- |
| `patient`          | 患者信息（`patient_id` / `name` / `department` / `bed` / `doctor_name`）           |
| `report_event`     | 核心表：一次报告分析事件（含 `overall_level`、`summary`、`alerts` JSON、`status`） |
| `treatment_record` | 医护处置记录（`event_id` / `remark` / `result` / `created_at`）                    |
| `file_record`      | 上传文件记录（`event_id` / `filename` / `filepath` / `upload_time`）               |

风险等级 `overall_level`：`green` 正常 / `yellow` 异常提醒 / `red` 高风险；状态 `status`：`pending` 待处理 / `processed` 已处理。

## 六、前端

本机未安装全局 Node.js，项目内置了便携版 Node（`E:\EVP\.tools\node`）。

> 注意：`.tools/` 体积约 143MB，已写入 `.gitignore` 不入库。**从仓库克隆后请自行安装 Node.js 18+**（或把便携版 Node 放回 `.tools/node` 并同步修改 `start.bat` 中的路径）。

**一键启动（推荐）**：双击项目根目录的 `start.bat`（会连同后端一起启动）；只想启动前端可用下文的手动方式。

手动启动方式：先把内置 Node 目录加入当前会话 PATH：

```powershell
cd e:\EVP\frontend
$env:PATH = "E:\EVP\.tools\node;" + $env:PATH

# 首次执行：安装依赖（国内网络建议加 --registry=https://registry.npmmirror.com）
npm install --registry=https://registry.npmmirror.com

# 启动开发服务器（vite.config.ts 已设 host=0.0.0.0，监听所有网卡）
npm run dev
# 或直接调用：node node_modules/vite/bin/vite.js --host 0.0.0.0 --port 5173
```

**患者端 AI 助手配置（可选）**：`/patient/upload` 页的 AI 健康助手通过 iframe 嵌入 Dify Agent WebApp，地址不在源码里写死，需在 `frontend/.env.local` 中提供（该文件已被 `.gitignore` 排除）：

```ini
VITE_DIFY_WEBAPP_URL=http://<dify-host>/agent/<app-id>
```

未配置时该卡片只显示提示、不影响其他功能。修改后需重启 `npm run dev` 生效。

- 患者端上传页：http://192.168.12.54:5173/patient/upload
- 患者端结果页：http://192.168.12.54:5173/patient/result/{event_id}
- 患者端历史页：http://192.168.12.54:5173/patient/history/{patient_id}
- 医护端实时监控大屏：http://192.168.12.54:5173/doctor/dashboard
- 医护端报告管理：http://192.168.12.54:5173/doctor/reports
- 医护端报告详情：http://192.168.12.54:5173/doctor/report/{event_id}

医护端（Ant Design Pro 风格布局）：侧边菜单 + 顶栏 + 内容区。大屏通过 WebSocket `/ws/doctor` 订阅 `event_created` 实时插入新报告（3s 自动重连、25s 心跳），下方为 ECharts 风险等级分布饼图 / 科室统计柱状图 / 最近 7 天趋势折线图；报告管理页支持 `patient_id` 搜索与风险等级、处理状态筛选；详情页可查看原始上传文件并提交处置。

图表依赖 `echarts`（按需引入 `echarts/core` + 柱/折/饼图 + 必要组件与 Canvas 渲染器），组件封装见 `frontend/src/components/EChart.tsx`。

前端通过 Vite 代理把 `/api`、`/uploads`、`/ws` 转发到 `http://127.0.0.1:8000`，无需额外配置跨域。

数据来源策略：优先请求后端真实接口；仅当后端不可用或返回 5xx 时降级到本地 Mock（`localStorage` 持久化），并在页面顶部提示；返回 4xx 时如实报错，不掩盖问题。

## 七、联调测试要点

1. 上传图片（PNG / JPG）一次，确认返回 `source` 为后端真实数据（无「本地演示数据」提示）
2. 正常报告（green）与异常报告（yellow / red）各一次
3. 医护端大屏应实时收到新报告（无需刷新）
4. 医护端提交处置后，患者端历史记录状态变为「已处理」
5. 按 `patient_id` 查询历史记录
