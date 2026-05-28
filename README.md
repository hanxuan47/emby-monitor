# Emby Monitor

基于 Tracearr 架构的 Emby 服务器实时监控面板。轻量级、单容器部署，支持实时流追踪、媒体库分析、用户活动统计。

## ✨ 功能

| 功能 | 说明 |
|------|------|
| 📊 **实时仪表盘** | 活跃流、在线用户、转码统计、带宽监控 |
| 🎬 **实时流监控** | 谁在看什么、用什么设备、转码状态、进度条 |
| 📚 **媒体库分析** | 电影/剧集/音乐统计、类型分布、存储空间、增长趋势 |
| 👥 **用户活动** | 每日播放数、活跃用户排⾏、观看时长统计 |
| 🎞 **编码分析** | 视频/音频编码分布、客户端分布、设备分布、播放方式分析 |
| ⏱ **最近添加** | 网格视图展示最近加入媒体库的内容 |
| 🔄 **WebSocket 实时更新** | 页面自动刷新，无需手动刷新 |
| 🐳 **Docker 单容器部署** | 一条命令启动 |

## 🚀 快速开始

### Docker 部署（推荐）

```bash
git clone https://github.com/yourname/emby-monitor.git
cd emby-monitor

# 启动
docker compose up -d

# 查看日志
docker compose logs -f
```

打开 `http://localhost:8000`，进入 **设置** 页面配置你的 Emby 服务器。

### 手动运行

```bash
# 安装依赖
pip install -r backend/requirements.txt

# 启动
cd backend && uvicorn main:app --host 0.0.0.0 --port 8000
```

## 🔧 配置

在 Emby 服务器中：

1. 进入 **设置 → 高级 → API 密钥**
2. 点击 **新建 API 密钥**
3. 输入名称（如 "Emby Monitor"）
4. 复制生成的密钥

然后在 Emby Monitor 的 **设置** 页面：

- **连接名称**：给你的服务器取个名字
- **服务器地址**：`http://你的emby地址:8096`
- **API Key**：粘贴刚才生成的密钥

## 🏗 项目结构

```
emby-monitor/
├── backend/
│   ├── main.py          # FastAPI 主服务 + WebSocket
│   ├── emby_client.py   # Emby API 客户端
│   ├── models.py        # SQLite 数据模型
│   └── requirements.txt
├── frontend/
│   └── index.html       # 单页仪表盘（Tailwind + Chart.js）
├── docker-compose.yml
├── Dockerfile
└── README.md
```

## 🛠 技术栈

| 层 | 技术 |
|----|------|
| 后端 | Python FastAPI + SQLite + WebSocket |
| 前端 | 原生 HTML + Tailwind CSS + Chart.js |
| 实时 | WebSocket (5s 轮询推送) |
| 存储 | SQLite (持久化会话历史、库快照) |
| 部署 | Docker |

## 📊 与 Tracearr 对比

| 特性 | Tracearr | Emby Monitor |
|------|----------|-------------|
| 多服务器 (Plex+Jellyfin+Emby) | ✅ | ❌ (仅 Emby) |
| 实时流监控 | ✅ | ✅ |
| 媒体库分析 | ✅ | ✅ |
| 编码/设备分析 | ✅ | ✅ |
| 用户活动追踪 | ✅ | ✅ |
| 共享检测 | ✅ | ❌ |
| 信任评分 | ✅ | ❌ |
| 流地图 | ✅ | ❌ |
| 告警通知 | ✅ | ❌ |
| 公共 API | ✅ | ✅ |
| 部署复杂度 | 高 (TimescaleDB+Redis+Node) | **低 (单容器 SQLite)** |
| 资源占用 | 中高 | **低 (~100MB RAM)** |

## 📝 License

MIT
