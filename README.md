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

## 使用说明

### 添加服务器

1. 浏览器打开 `http://localhost:9000`
2. 点击左侧 **管理** → 需要登录（默认用户名 `admin`，密码见控制台输出；可在 `config.json` 中将 `require_login` 设为 `false` 关闭登录）
3. 填写服务器名称、选择类型（Java / 基岩）、输入地址
4. 点击 **保存服务器**

### 页面导航

| 页面 | 功能 |
| --- | --- |
| 首页 | 所有服务器概览卡片（在线状态、延迟、版本、玩家数、副地址状态） |
| 服务器 | 服务器列表 + MOTD + 在线玩家数 + 副地址状态 |
| 玩家 | 所有玩家列表，支持在线/离线筛选、按名称/时长/最后在线排序，点击进入详情 |
| 玩家详情 | 基本信息、UUID、当前所在服务器、最近游玩服务器（点击名称跳转详情，点击时间跳转并自动设定历史时段）、24 小时在线时段柱状图、名称旁可一键复制 |
| 服务器详情 | 版本/协议/MOTD 信息、在线玩家列表（点击跳转详情）、副地址状态、**在线历史折线图**、主/副地址旁可一键复制 |
| 玩家管理 | 搜索、删除玩家数据（需登录） |
| 管理 | 添加/编辑/删除服务器、修改用户名密码和检测间隔、数据库优化 |

### 在线历史图表

在服务器详情页，支持 15 分钟 / 1h / 6h / 24h / 7d / 30d / 自定义时间段查询。6h 以上支持滚轮缩放 + 拖拽平移。点击数据点可固定显示该时刻的在线玩家列表。

### 通知

首页右上角 **通知: 开/关** 可全局切换服务器上下线通知。服务器详情页 **玩家通知** 可按服务器单独开启，在线人数 ≤ 12 时会推送玩家加入/离开提醒。通知通过浏览器推送，需授权。

### 主题切换

侧边栏顶部按钮切换深色/浅色主题，偏好自动保存到浏览器。站点 favicon 角标动态显示在线服务器数量——绿色全在线，橙色部分在线，红色全离线。

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
| `host` | string | 监听地址，默认 `0.0.0.0` |
| `port` | int | 监听端口，默认 `9000` |
| `db_path` | string | 数据库文件路径，默认 `monitor.db` |
| `offline_threshold` | int | 连续离线 N 次后才发送下线通知，默认 `2` |

## 数据流

后台轮询（间隔 `check_interval` 秒）并行查询所有服务器和地址 → 写入内存状态 + SQLite 历史 → 通过 Socket.IO 推送全量状态到所有前端。查询睡眠时间动态调整，确保实际间隔等于配置值。玩家追踪通过对比连续两轮在线列表的快照来判断上下线，连续 3 次轮询不在线才判定离线。

## 地址格式与回退

| 示例 | 行为 |
| --- | --- |
| `127.0.0.1:25565` | 直连 IP + 端口 |
| `mc.example.com:25566` | 直连域名 + 端口 |
| `hypixel.net` | 无端口时自动 SRV DNS 解析 |

每个服务器可配置多个副地址。主地址连接失败时按顺序尝试副地址，全部失败则标记为离线。

## Java / 基岩版

每个服务器可标记为 Java 版或基岩版类型。基岩版服务器通过 `BedrockServer` 查询，与 Java 版有以下差异：

- 不返回玩家样本列表（仅在线人数统计），无服务器图标
- 额外返回地图名称、游戏模式、服务端品牌信息
- MOTD 为纯文本（无 § 格式码，不需要颜色解析）

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
| DELETE | `/api/servers/<id>` | 删除服务器（`?clean_data=1` 同时删除关联的玩家在线记录） |
| GET | `/api/servers/check-name?name=` | 检查是否存在同名已删除服务器的残留数据 |
| POST | `/api/servers/cleanup` | 清除指定名称的残留玩家在线记录（`{"name":"..."}`） |

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
- mcstatus（Minecraft Java / Bedrock 服务器查询）
- Chart.js + chartjs-adapter-date-fns + chartjs-plugin-zoom + Hammer.js（CDN 引入）
- Socket.IO 客户端（CDN 引入）
