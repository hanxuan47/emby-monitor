# Emby Monitor

基于 Tracearr 架构的 Emby 服务器影视管理面板。iOS 毛玻璃设计，14 大功能模块，全响应式（桌面 + 手机）。

## ✨ 功能模块

| 模组 | 功能 |
|------|------|
| 📊 **仪表盘** | 活跃流、在线用户、转码统计、总带宽、今日播放趋势图 |
| 🎬 **实时流** | 谁在看什么、客户端/设备/IP、转码状态、进度条 |
| 👤 **Emby 用户管理** | 创建/删除/启用禁用/改密、TG绑定、一次性登录码 |
| 🎞 **编码分析** | 视频/音频编码分布、客户端/设备分布、转码率统计 |
| 📚 **媒体库** | 电影/剧集/音乐统计、类型饼图、存储分布、增长趋势 |
| 🖥 **站点管理** | 多线路管理（Emby/Jellyfin/代理）、**一键并行测速** |
| 🎫 **工单系统** | 提交/回复/分类/优先级、管理员处理、关闭工单 |
| ✅ **每日签到** | 签到领积分、连续签到奖励（10+min(连续×2,50)分） |
| 📬 **通知** | SMTP 邮件 + Telegram Bot 通知、配置测试、通知历史 |
| 🎬 **影片评价** | 5 星评分、评价内容、个人评价历史 |
| 👥 **用户活动** | 每日播放量统计、活跃用户趋势、Top 10 排名 |
| 🔐 **认证系统** | 注册/登录/JWT Token/邮箱验证码找回密码 |

## 🖥 界面预览

- **iOS 毛玻璃设计** — `backdrop-filter: blur(30px)` 玻璃质感卡片
- **SF Pro 字体** — 原生 Apple 字体栈
- **全响应式** — 桌面侧栏导航 ↔ 手机底部 Tab Bar（5 个常用 Tab）
- **14 个页面** — 侧栏分组导航，页面切换淡入动画
- **暗色主题** — 深色背景 + 光晕渐变，护眼且高级

## 🚀 快速开始

### 前置条件

- Docker & Docker Compose（推荐）
- 一个 Emby 服务器（含 API Key）

### 部署

```bash
# 1. 获取项目
git clone https://github.com/hanxuan47/emby-monitor.git
cd emby-monitor

# 2. 启动
docker compose up -d

# 3. 打开浏览器
# http://localhost:8000
```

### 首次使用

```
1. 打开 http://localhost:8000
2. 注册账号（用户名 + 邮箱 + 密码）
3. 左侧导航 → 设置
4. 填入 Emby 服务器地址和 API Key
5. 点击连接 → 返回仪表盘
```

## 🔐 加密与安全

### 敏感数据加密存储

所有凭据在存入 SQLite 前自动加密：

| 数据 | 加密方式 |
|------|----------|
| Emby API Key | AES 对称加密 + HMAC 认证 |
| SMTP 密码 | AES 对称加密 + HMAC 认证 |
| Telegram Bot Token | AES 对称加密 + HMAC 认证 |
| 用户密码 | PBKDF2-HMAC-SHA256（10 万轮 + 随机盐） |

### 加密密钥管理

**推荐设置固定密钥**（密钥不会随容器重建丢失）：

```bash
# 生成加密密钥
docker compose run --rm emby-monitor python3 -c "
import base64, os
print(base64.urlsafe_b64encode(os.urandom(32)).decode())
"
```

编辑 `docker-compose.yml`：

```yaml
services:
  emby-monitor:
    environment:
      - ENCRYPTION_KEY=a3Fh2dG8xP9vB4nM6kL1zR5tW7yC0eJ3  # 替换为你生成的密钥
```

如果不设置 `ENCRYPTION_KEY`，系统会在首次启动时自动生成密钥保存在 `./data/.encryption_key` 文件中。备份数据库时请同时备份此文件。

### 密钥优先级

```
1. ENCRYPTION_KEY 环境变量  ← 推荐
2. ./data/.encryption_key 文件  ← 自动生成（备选）
```

## 🐳 Docker 部署详解

### docker-compose.yml

```yaml
version: "3.8"
services:
  emby-monitor:
    build: .
    container_name: emby-monitor
    ports:
      - "8000:8000"
    volumes:
      - ./data:/app/data
    restart: unless-stopped
    environment:
      - TZ=Asia/Shanghai
      - ENCRYPTION_KEY=your-key-here  # 🔑 建议设置固定密钥
```

### docker run

```bash
docker build -t emby-monitor .
docker run -d \
  --name emby-monitor \
  -p 8000:8000 \
  -v $(pwd)/data:/app/data \
  -e TZ=Asia/Shanghai \
  -e ENCRYPTION_KEY=your-key-here \
  --restart unless-stopped \
  emby-monitor
```

### 运维命令

```bash
# 查看日志
docker compose logs -f

# 重新构建（代码更新后）
docker compose up -d --build

# 停止
docker compose down

# 备份（数据库 + 加密密钥）
cp -r data/ backup_$(date +%Y%m%d)/
```

## 🏗 项目结构

```
emby-monitor/
├── Dockerfile                    # python:3.12-slim
├── docker-compose.yml           # 单容器编排
├── backend/
│   ├── main.py                  # FastAPI 主服务 + 监控 API (850行)
│   ├── feature_routes.py        # 8 大功能模块 API (1049行)
│   ├── emby_client.py           # Emby API 封装 (27 方法)
│   ├── models.py                # 16 个数据模型
│   ├── crypto.py                # AES 加密 + PBKDF2 密码哈希
│   └── requirements.txt
├── frontend/
│   └── index.html               # iOS 毛玻璃 SPA (440行)
└── data/                        # SQLite + 加密密钥（自动创建）
```

## 🛠 技术栈

| 层 | 技术 |
|----|------|
| 后端 | Python FastAPI + SQLAlchemy + SQLite |
| 前端 | 原生 HTML + Tailwind CSS + Chart.js |
| 实时 | WebSocket (5s 轮询推送) |
| 加密 | AES-128 + HMAC + PBKDF2 (纯 Python) |
| 部署 | Docker（单容器，~150MB） |

## 📊 对比其他方案

| | Tautulli | Jellystat | Tracearr | **Emby Monitor** |
|--|----------|-----------|----------|-----------------|
| Plex | ✅ | ❌ | ✅ | ❌ |
| Jellyfin | ❌ | ✅ | ✅ | ❌ |
| Emby | ❌ | ✅ | ✅ | **✅** |
| 共享检测 | ❌ | ❌ | ✅ | ❌ |
| 工单系统 | ❌ | ❌ | ❌ | **✅** |
| 每日签到 | ❌ | ❌ | ❌ | **✅** |
| 站点测速 | ❌ | ❌ | ❌ | **✅** |
| 部署复杂度 | ⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ | **⭐ (单容器)** |
| 内存占用 | ~200MB | ~200MB | ~500MB | **~60MB** |

## 📝 License

MIT
