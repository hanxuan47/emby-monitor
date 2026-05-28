# Emby Monitor

基于 iOS 毛玻璃设计的 Emby 影视管理面板。React + FastAPI 全栈，16 个功能模块，卡密注册系统，Telegram Bot 通知，全响应式设计。

## ✨ 功能模块

### 🎯 核心监控
| 模块 | 说明 |
|------|------|
| 📊 **仪表盘** | 活跃流、在线用户、媒体总数、今日播放 |
| 📺 **实时流** | 谁在看什么、客户端/设备/IP、转码状态 |
| 💬 **活跃会话** | 所有播放会话一览，支持踢出 |
| 📚 **媒体库** | 电影/剧集/音乐统计、存储分布 |
| 🆕 **最近更新** | 最近添加到 Emby 的媒体 |
| 🎞️ **编码分析** | 视频/音频编码分布、转码率统计 |

### 👥 用户系统
| 模块 | 说明 |
|------|------|
| 👤 **用户活动** | 每日播放量统计、Top 10 排名 |
| 🔧 **Emby 用户管理** | 创建/删除/启用/改密、登录码 |
| ⭐ **影片评价** | 5 星评分 + 评论 |
| 🎫 **工单系统** | 用户提交/管理员处理/分类/优先级 |

### 🎬 影视发现 & 求片
| 模块 | 说明 |
|------|------|
| 🔍 **影视发现** | TMDB 搜索电影/剧集 + 本周热门 |
| 📋 **求片系统** | 用户提交 → 管理员审批/驳回 → 标记入库 |
| 👍 **投票机制** | 用户给求片投票，管理员优先处理热门 |

### 💳 会员 & 运营
| 模块 | 说明 |
|------|------|
| 🎴 **卡密系统** | 管理员批量生成卡密，用户注册必须输入卡密 |
| ✅ **每日签到** | 签到领积分，连续签到奖励递增 |
| 🔔 **通知管理** | SMTP 邮件 + Telegram 通知配置 |
| 📢 **TG 广播** | 管理员群发消息到所有绑定用户 |

### 🤖 Telegram Bot
| 命令 | 说明 |
|------|------|
| `/start` | 欢迎信息 + 帮助 |
| `/bind 验证码` | 绑定面板账号 |
| `/unbind` | 解绑 |
| `/status` | 查看绑定状态 |

**自动推送**：求片通过/驳回/入库、工单回复 → 自动推送到用户 TG。

## 🖥️ 界面

- **iOS 毛玻璃设计** — `backdrop-filter: blur(30px)` 玻璃质感，SF 字体
- **React + TypeScript SPA** — Vite 构建，页面切换淡入动画
- **全响应式** — 桌面侧栏导航 ↔ 手机底部 Tab Bar
- **暗色主题** — 深色背景 + 光晕渐变

## 🚀 快速开始

### 前置条件

- Docker & Docker Compose
- 一个 Emby 服务器（含 API Key）
- （可选）TMDB API Key — [免费申请](https://www.themoviedb.org/settings/api)
- （可选）Telegram Bot Token — [@BotFather](https://t.me/BotFather) 创建

### 一键部署（1Panel / Docker Compose）

```yaml
# docker-compose.yml
services:
  emby-monitor:
    build: https://github.com/hanxuan47/emby-monitor.git
    container_name: emby-monitor
    ports:
      - "8000:8000"
    volumes:
      - ./data:/app/data
    restart: unless-stopped
    environment:
      - TZ=Asia/Shanghai
      # 🔑 加密密钥（强烈建议设置）
      - ENCRYPTION_KEY=your-base64-key-here
```

首次启动会自动从 GitHub 构建镜像。（若在国内服务器，可先 git clone 后本地构建）

```bash
# 启动
docker compose up -d

# 查看日志
docker compose logs -f

# 更新到最新版本
docker compose down
docker compose build --no-cache
docker compose up -d
```

### 传统部署（git clone + 本地构建）

```bash
git clone https://github.com/hanxuan47/emby-monitor.git
cd emby-monitor

# 构建镜像
docker compose build --no-cache

# 启动
docker compose up -d

# 访问
# http://localhost:8000
```

## 🎯 首次使用流程

```
1. 打开 http://localhost:8000
   → 自动进入管理员初始化页面

2. 填写用户名 + 邮箱 + 密码
   → 第一个用户自动成为管理员

3. 登录后 → 设置 → 填写 Emby 连接信息
   → 地址: http://192.168.1.100:8096
   → API Key: 从 Emby 后台获取

4. （可选）设置 → TMDB 配置
   → 填 TMDB API Key → 开启影视搜索功能

5. （可选）设置 → TG Bot Token
   → 填 Bot Token → 用户可绑定 TG 接收通知

6. 设置 → 开放用户注册
   → 生成卡密给用户使用
```

## 🔐 卡密系统

注册必须填写卡密。管理员操作流程：

```
管理员 → 卡密管理
├── 生成卡密：数量 / 积分 / 有效期
└── 管理卡密：查看状态 / 删除无效卡密

用户 → 注册 → 输入卡密（如 EMBY-XXXX-XXXX-XXXX）
     → 注册成功，获得初始积分
```

> 💡 第一个管理员注册不需要卡密，后续用户注册必须输入卡密。

## 🤖 Telegram Bot 配置

```
管理员 → 设置 → 填 Bot Token（找 @BotFather 获取）
     → 重启容器，Bot 自动启动

用户 → TG 绑定 → 点"生成验证码"
     → 在 TG 中发 /bind 验证码
     → 绑定成功

自动推送：
  ✅ 求片通过 → 通知提交者
  ✅ 求片驳回 → 通知提交者（含原因）
  ✅ 求片入库 → 通知提交者
  ✅ 工单回复 → 通知对方
  📢 TG 广播 → 管理员群发所有绑定用户
```

## 🔐 加密与安全

| 数据 | 加密方式 |
|------|----------|
| Emby API Key | AES-128-CBC (Fernet) |
| SMTP 密码 | AES-128-CBC (Fernet) |
| TG Bot Token | AES-128-CBC (Fernet) |
| 用户密码 | PBKDF2-HMAC-SHA256 (10 万轮) |

### 加密密钥管理

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
      - ENCRYPTION_KEY=a3Fh2dG8xP9vB4nM6kL1zR5tW7yC0eJ3
```

不设置则自动生成密钥保存在 `./data/.encryption_key`。备份数据时请同时备份此文件。

## 🛠️ API 概览（共 46 个端点）

| 模块 | 端点 |
|------|------|
| 认证 | register / login / me / forgot-password / reset-password / update-profile |
| 仪表盘 | dashboard/summary |
| 实时流 | streams/active / streams/history |
| 媒体库 | library/stats / recently-added / codec-breakdown |
| 用户管理 | users/activity / users/manage\* |
| 评价 | media/review / media/reviews / media/my-reviews |
| 站点 | sites / sites/create / sites/test/{id} / sites/test-all |
| 工单 | tickets / tickets/create / tickets/{id} / tickets/{id}/reply / tickets/{id}/status |
| 签到 | checkin / checkin/status |
| 通知 | notify/config / notify/send / notify/logs |
| TMDB | tmdb/search / tmdb/trending / config/tmdb |
| 求片 | requests/create / requests/list / requests/vote / requests/approve/{id} / requests/reject/{id} / requests/downloaded/{id} |
| 卡密 | admin/cards/create / admin/cards/list / admin/cards/delete / card/validate |
| TG | tg/bind-code / tg/binding-status / tg/unbind / tg/broadcast |

## 🏗️ 项目结构

```
emby-monitor/
├── Dockerfile                  # 多阶段构建 (React → Python)
├── docker-compose.yml          # 单容器编排
├── backend/
│   ├── main.py                 # FastAPI 主服务 (886行)
│   ├── feature_routes.py       # 所有功能 API (1762行)
│   ├── tg_bot.py               # Telegram Bot 轮询服务
│   ├── emby_client.py          # Emby API 封装
│   ├── emby_crypto.py          # AES 加密 + PBKDF2
│   ├── models.py               # 16 个 SQLAlchemy 模型
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx             # 路由定义
│   │   ├── api/                # API 客户端 + auth
│   │   ├── components/         # Layout / Toast
│   │   └── pages/              # 9 个页面组件
│   └── package.json
└── data/                       # SQLite + 密钥（自动创建）
```

## 🛠️ 技术栈

| 层 | 技术 |
|----|------|
| 后端 | Python 3.12 + FastAPI + SQLAlchemy + SQLite |
| 前端 | React 18 + TypeScript + Vite |
| 实时 | WebSocket (5s 轮询) |
| TG Bot | HTTP 长轮询 (httpx) |
| 加密 | Fernet (AES-128-CBC) + PBKDF2-HMAC-SHA256 |
| 部署 | Docker 单容器 (~150MB) |

## 🐳 运维命令

```bash
# 更新代码
docker compose down
docker compose build --no-cache
docker compose up -d

# 查看日志
docker compose logs -f

# 备份（数据库 + 加密密钥）
cp -r data/ backup_$(date +%Y%m%d)/

# 进入容器
docker compose exec emby-monitor sh
```

## 📝 License

MIT
