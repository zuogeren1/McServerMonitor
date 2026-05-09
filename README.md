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

首次启动会在目录下生成 `config.json`，包含随机生成的登录凭据，控制台会输出密码。

## 项目结构

```
├── app.py                   Flask 路由、WebSocket、轮询主循环、登录与配置
├── db.py                    数据库操作、玩家追踪、UUID 查询
├── mc_query.py              Minecraft 服务器查询、MOTD § 格式转换
├── requirements.txt         Python 依赖
├── config.json              首次启动生成的配置文件（凭据、检测间隔）
├── monitor.db               运行时自动生成的 SQLite 数据库
├── start.ps1                PowerShell 一键启动脚本
├── templates/
│   └── index.html           页面结构 + SVG 图标精灵
└── static/
    ├── css/style.css        样式（深色/浅色主题、响应式布局）
    └── js/
        ├── app.js           状态管理、导航、页面渲染、管理页、登录
        ├── chart.js         折线图、实时更新、缩放平移、滚动条
        └── players.js       玩家列表、玩家详情、时段分布柱状图
```

## 功能

### 首页

- 服务器总数 / 在线数统计卡片
- 服务器基本信息卡片（名称、地址、状态、延迟、版本）

### 服务器页

- 同上，增加玩家数量和 MOTD（支持 § 颜色代码渲染）

### 服务器详情

- **服务器信息**：版本、协议号、延迟、在线人数、MOTD（带格式）
- **在线玩家**：crafthead 头像 + 名称，合并匿名玩家显示，点击查看详情
- **副地址状态**：主/副地址各自在线状态与延迟
- **在线历史折线图**：
  - 时间范围：15 分钟 / 1h / 6h / 24h / 7d / 30d / 自定义
  - 鼠标悬停显示竖线辅助定位 + 当时在线人数
  - 点击数据点固定显示该时刻在线玩家列表
  - 6h 及以上范围自动启用滚轮缩放 + 拖拽平移 + 底部滚动条
  - 移动端支持双指缩放
  - LTTB 算法自适应数据点密度
  - 时间刻度自适应缩放级别

### 玩家列表

- 匿名玩家独立区域（位于排序控件上方）
- 正常玩家支持过滤（全部 / 在线 / 离线）和排序（A-Z / 上次在线 / 总时长）
- 点击进入玩家详情

### 玩家详情

- **基本信息**：头像、名称、UUID（首次访问时从 playerdb.co 查询，刷新不重复查询）
- **在线状态**：当前服务器
- **最近服务器**：近期访问记录及时间区间
- **在线时段分布**：24 小时柱状图，柱顶显示数值，移动端自适应标签

### 玩家管理（独立页面）

- 搜索玩家
- 删除玩家及其全部数据（需登录）

### 管理页

- **服务器管理**：添加 / 编辑 / 删除服务器
  - 主地址支持 `host:port` 或纯域名（SRV 解析）
  - 副地址可添加多个，主地址失败时依次回退
- **凭据与检测间隔**：修改用户名、密码、轮询间隔
- **登录保护**（默认开启，可在 config.json 中关闭）

### 界面

- 可折叠侧边栏，收起时图标 + tooltip
- 深色 / 浅色主题切换
- 移动端响应式适配（侧边栏覆盖式、单列布局、触摸友好的滑块和按钮）
- 纯 SVG 图标，无外部图标库依赖

## 配置文件

`config.json`（首次启动自动生成）：

```json
{
  "username": "admin",
  "password": "随机生成",
  "check_interval": 5,
  "require_login": true
}
```

| 字段 | 说明 |
| --- | --- |
| `username` | 管理页登录用户名 |
| `password` | 管理页登录密码 |
| `check_interval` | 服务器检测间隔（秒） |
| `require_login` | 是否启用登录保护，`false` 时管理页无需登录 |

## API

| 方法 | 路径 | 说明 | 需登录 |
| --- | --- | --- | --- |
| GET | `/api/status` | 所有服务器实时状态 | |
| GET | `/api/status/<id>` | 单台服务器状态 | |
| GET | `/api/servers` | 获取服务器列表 | |
| POST | `/api/servers` | 添加服务器 | ✓ |
| PUT | `/api/servers/<id>` | 更新服务器 | ✓ |
| DELETE | `/api/servers/<id>` | 删除服务器 | ✓ |
| GET | `/api/servers/<id>/history?range=15m` | 历史数据 | |
| GET | `/api/servers/<id>/history?start=&end=` | 自定义时间段历史 | |
| GET | `/api/servers/<id>/player-list?ts=` | 指定时刻玩家列表 | |
| GET | `/api/config` | 获取配置信息 | |
| POST | `/api/login` | 登录 | |
| POST | `/api/logout` | 登出 | |
| POST | `/api/admin/config` | 修改配置 | ✓ |
| GET | `/api/players?filter=&sort=` | 玩家列表 | |
| GET | `/api/players/<name>` | 玩家详情 | |
| DELETE | `/api/players/<name>` | 删除玩家 | ✓ |

## 地址格式

| 示例 | 行为 |
| --- | --- |
| `127.0.0.1:25565` | 直连 IP + 端口 |
| `mc.example.com:25566` | 直连域名 + 端口 |
| `hypixel.net` | 无端口时自动 SRV DNS 解析 |

## 匿名玩家处理

- 所有名称含空格的玩家合并为 `Anonymous Player`
- N 人同时在线时显示为 `Anonymous Player xN`
- 在线时长按人数累计：2 人同时在线 1 分钟 = 统计增加 2 分钟

## 依赖

- Python 3.10+
- Flask + Flask-SocketIO + eventlet
- mcstatus（Minecraft 服务器查询）
- Chart.js + chartjs-adapter-date-fns + chartjs-plugin-zoom + hammer.js（前端图表与缩放）
- Socket.IO 客户端
