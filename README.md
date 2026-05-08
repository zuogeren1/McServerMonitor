# MC Server Monitor

Minecraft 服务器监控面板，支持多服务器管理、地址回退、实时在线历史、玩家追踪。

## 快速开始

```bash
# 1. 创建并激活虚拟环境
python -m venv .venv
.venv\Scripts\activate      # Windows
# source .venv/bin/activate  # Linux/Mac

# 2. 安装依赖
pip install -r requirements.txt

# 3. 启动
python app.py

# 4. 浏览器访问
# http://localhost:9000
```

## 项目结构

```
├── app.py                  Flask 路由、WebSocket、轮询主循环
├── db.py                   数据库操作、玩家追踪
├── mc_query.py             Minecraft 服务器查询、MOTD 格式转换
├── requirements.txt        Python 依赖
├── monitor.db              运行时自动生成的 SQLite 数据库
├── templates/
│   └── index.html          页面结构 + SVG 图标
└── static/
    ├── css/style.css       样式
    └── js/
        ├── app.js          状态管理、导航、页面渲染、管理页
        ├── chart.js        折线图、实时更新
        └── players.js      玩家列表、玩家详情
```

## 功能

### 首页
- 服务器总数 / 在线数统计
- 已添加服务器的基本信息卡片（名称、地址、在线状态、延迟、版本）
- 点击卡片进入详情

### 服务器页
- 同首页基础上增加玩家数量和 MOTD 显示

### 服务器详情
- **服务器信息**：版本、协议号、延迟、在线人数、MOTD（带颜色格式）
- **在线玩家**：crafthead 头像 + 玩家名，点击查看玩家详情
- **副地址状态**：主地址和各副地址的在线/离线状态及延迟
- **在线历史折线图**：支持 15 分钟 / 1h / 6h / 24h / 7d / 30d / 自定义时间段
  - 鼠标移至数据点查看当时在线人数
  - 点击数据点固定显示当时在线玩家列表

### 玩家列表
- 过滤：全部 / 在线 / 离线
- 排序：A-Z / 上次在线 / 在线总时长
- 点击进入玩家详情

### 玩家详情
- **基本信息**：名称、头像、UUID、在线状态、总在线时长、首次出现时间
- **最近服务器**：当前在线服务器 + 近期访问记录及时间区间
- **在线时段分布**：0-23 时柱状图，显示各时段累计在线时长

### 管理页
- 配置检测间隔（秒）
- 添加 / 编辑 / 删除服务器
- **主地址**：支持 `host:port` 或纯域名（SRV 解析）
- **副地址**：可添加多个备选地址，主地址失败时依次尝试

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/status` | 所有服务器实时状态 |
| GET | `/api/status/<id>` | 单台服务器状态 |
| GET/POST | `/api/servers` | 获取/添加服务器 |
| PUT/DELETE | `/api/servers/<id>` | 更新/删除服务器 |
| GET | `/api/servers/<id>/history?range=15m` | 历史数据 (`15m/1h/6h/24h/7d/30d`) |
| GET | `/api/servers/<id>/history?start=&end=` | 自定义时间范围历史 |
| GET/POST | `/api/config` | 获取/设置检测间隔 |
| GET | `/api/players?filter=online&sort=name` | 玩家列表 |
| GET | `/api/players/<uuid>` | 玩家详情 |

## 地址格式

- `127.0.0.1:25565` — 直连指定 IP 和端口
- `mc.example.com:25566` — 直连域名和端口
- `hypixel.net` — 无端口时自动 SRV DNS 解析，适用于套了 SRV 记录的服务器

## 依赖

- Python 3.10+
- Flask + Flask-SocketIO（Web 框架 + WebSocket）
- mcstatus（Minecraft 服务器查询）
- eventlet（异步支持）
- Chart.js + chartjs-adapter-date-fns（前端图表）
- Socket.IO 客户端（前端实时通信）
