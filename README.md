# MC Server Monitor

Minecraft 服务器监控面板，支持多服务器管理、地址回退、实时在线历史与玩家追踪。

## 快速开始

```bash
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # Linux/Mac

pip install -r requirements.txt
python app.py                   # http://localhost:9000
```

首次启动自动生成 `config.json`（含随机密码），控制台会打印密码。

## 项目结构

```
├── app.py                      Flask 路由、WebSocket、轮询主循环、登录与配置
├── db.py                       数据库操作、玩家追踪、UUID 查询
├── mc_query.py                 服务器查询、MOTD § 格式转换
├── requirements.txt
├── config.json                 运行配置（首次启动自动生成）
├── monitor.db                  运行时生成的 SQLite 数据库
├── templates/
│   └── index.html              完整页面结构与 SVG 图标精灵
└── static/
    ├── css/style.css           样式（深色/浅色主题、响应式布局）
    └── js/
        ├── app.js              全局状态、导航、渲染、管理页、登录
        ├── chart.js            折线图、缩放平移、滚动条、LTTB 抽稀
        └── players.js          玩家列表、玩家详情、时段分布柱状图
```

## 配置文件

`config.json`（首次启动自动生成）：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `username` | string | 管理页登录用户名 |
| `password` | string | 管理页登录密码 |
| `check_interval` | int | 服务器检测间隔（秒） |
| `require_login` | bool | 是否启用登录保护，`false` 时管理页无需登录 |

## 数据流

后台轮询线程（间隔 `check_interval` 秒）查询所有服务器 → 写入内存状态 + SQLite 历史 → 通过 Socket.IO 推送全量状态到所有前端。玩家追踪通过对比连续两轮在线列表的快照来判断上下线，连续 3 次轮询不在线才判定离线。

## 地址格式与回退

| 示例 | 行为 |
| --- | --- |
| `127.0.0.1:25565` | 直连 IP + 端口 |
| `mc.example.com:25566` | 直连域名 + 端口 |
| `hypixel.net` | 无端口时自动 SRV DNS 解析 |

每个服务器可配置多个副地址。主地址连接失败时按顺序尝试副地址，全部失败则标记为离线。

## 匿名玩家

名称中含空格的玩家（常见于 Bedrock 版/离线服）统一合并为 `Anonymous Player`。N 人同时在线时显示为 `Anonymous Player xN`，在线时长按人数加权累加（2 人同时在线 1 分钟 = 统计增加 2 分钟）。

## API

### 实时状态

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/status` | 所有服务器实时状态 |
| GET | `/api/status/<id>` | 单台服务器状态 |

### 服务器管理（需登录）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/servers` | 获取服务器列表 |
| POST | `/api/servers` | 添加服务器 |
| PUT | `/api/servers/<id>` | 更新服务器 |
| DELETE | `/api/servers/<id>` | 删除服务器 |

### 历史数据

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/servers/<id>/history?range=15m` | 历史数据（支持 15m/1h/6h/24h/7d/30d） |
| GET | `/api/servers/<id>/history?start=&end=` | 自定义时间段历史 |
| GET | `/api/servers/<id>/player-list?ts=` | 指定时刻的在线玩家列表 |

### 玩家

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/players?filter=&sort=` | 玩家列表（filter: online/offline, sort: name/last_seen/total_time） |
| GET | `/api/players/<name>` | 玩家详情 |
| DELETE | `/api/players/<name>` | 删除玩家（需登录） |

### 登录与配置

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/config` | 获取配置信息 |
| POST | `/api/login` | 登录 |
| POST | `/api/logout` | 登出 |
| POST | `/api/admin/config` | 修改凭据与检测间隔（需登录） |
| POST | `/api/admin/optimize` | 数据库优化与数据清理（需登录） |

## 依赖

- Python 3.10+
- Flask + Flask-SocketIO + eventlet
- mcstatus（Minecraft Java 服务器查询）
- Chart.js + chartjs-adapter-date-fns + chartjs-plugin-zoom + Hammer.js（CDN 引入）
- Socket.IO 客户端（CDN 引入）
