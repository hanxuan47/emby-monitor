# Emby Monitor

基于 **iOS 毛玻璃设计** 的全功能 Emby 影视管理面板。React + FastAPI 全栈，18 个功能模块，卡密注册系统，AI 智能分析，IP 用户地图，Telegram Bot 通知，全响应式设计。

---

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

### 🤖 AI 智能分析
| 模块 | 说明 |
|------|------|
| 🧠 **AI 扫描** | 扫描用户行为 → 自动判断异常/可疑/水军用户 |
| 📋 **AI 审计日志** | 所有 AI 判定记录，支持查看详情和二次人工审核 |
| ⚙️ **AI 配置** | 规则权重、LLM 开关、预设模型切换（OpenAI / DeepSeek / Moonshot） |
| 🔍 **IP 检测** | 检测代理/VPN IP、多账号同 IP、异常地区登录 |

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

### 🌍 用户地图
| 模块 | 说明 |
|------|------|
| 📍 **用户地图** | 基于 Emby 活跃会话 IP → 在地图上展示用户分布 |
| 🗺️ **高德地图渲染** | 深色底图 + 用户标记 + 信息弹窗（设备/ISP/播放内容） |
| 🔄 **自动缩放** | 根据所有在线用户位置自适应地图范围 |

### 🤖 Telegram Bot
| 命令 | 说明 |
|------|------|
| `/start` | 欢迎信息 + 帮助 |
| `/bind 验证码` | 绑定面板账号 |
| `/unbind` | 解绑 |
| `/status` | 查看绑定状态 |

**自动推送**：求片通过/驳回/入库、工单回复 → 自动推送到用户 TG。

---

## 🖥️ 界面

- **iOS 毛玻璃设计** — `backdrop-filter: blur(30px)` 玻璃质感，SF 字体
- **React + TypeScript SPA** — Vite 构建，页面切换淡入动画
- **全响应式** — 桌面侧栏导航 ↔ 手机底部 Tab Bar
- **暗色主题** — 深色背景 + 光晕渐变

---

## 🚀 快速开始

### 前置条件

- Docker & Docker Compose
- 一个 Emby 服务器（含 API Key）
- （可选）TMDB API Key — [免费申请](https://www.themoviedb.org/settings/api)
- （可选）Telegram Bot Token — [@BotFather](https://t.me/BotFather) 创建
- （可选）高德地图 JS API Key — [申请地址](https://console.amap.com/dev/key/app)（用于用户地图）

### 一键部署（1Panel / Docker Compose）

```yaml
# docker-compose.yml
services:
  emby-monitor:
    image: ghcr.io/hanxuan47/emby-monitor:latest
    container_name: emby-monitor
    ports:
      - "8000:8000"
    volumes:
      - ./data:/app/data
    restart: unless-stopped
    environment:
      - TZ=Asia/Shanghai
      # 🔑 加密密钥（强烈建议设置，32字节 base64）
      - ENCRYPTION_KEY=your-base64-key-here
```

```bash
# 启动
docker compose up -d

# 查看日志
docker compose logs -f

# 更新到最新版本
docker compose down
docker compose pull
docker compose up -d
```

### 传统部署（本地构建）

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

---

## 🎯 首次使用流程

```
1. 打开 http://localhost:8000
   → 自动进入管理员初始化页面

2. 填写用户名 + 邮箱 + 密码（≥8位）
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

---

## 🗺️ 用户地图使用

面板内置 **用户地理位置地图**，展示所有在线用户的活动位置。

```
1. 确保 Emby 已连接且用户在线
   → 管理面板 → 用户地图

2. 首次使用需输入高德地图 JS API Key
   → 前往 https://console.amap.com/dev/key/app 申请
   → 选择「Web端(JS API)」类型
   → 粘贴 Key 即可

3. 点击地图上的标记
   → 查看用户详情：设备、播放内容、位置、ISP

4. 可随时点击「换Key」更换地图 Key
```

> 💡 后端使用 ip-api.com 免费解析 IP 地理位置（无需 Key），前端使用高德地图渲染。所有 IP 解析仅内存缓存，不持久化存储。

---

## 🤖 AI 智能分析

面板内置 AI 引擎，可自动分析用户行为，识别异常用户。

```
管理员 → AI 分析
├── AI 扫描 → 点击开始 → 扫描所有用户
│   ├── 规则分析（内置权重系统）
│   │   ├── 同 IP 多账号
│   │   ├── 代理/VPN IP
│   │   ├── 播放量异常
│   │   ├── 登录频率异常
│   │   └── 设备变更频繁
│   └── LLM 增强（可选）
│       ├── OpenAI 预设
│       ├── DeepSeek 预设
│       └── Moonshot 预设
├── AI 审计日志 → 查看历史判定记录
│   ├── 展开查看详情
│   ├── 人工审核（标记误判/确认可疑）
│   └── 直跳 Emby 管理页面操作
└── AI 配置
    ├── 规则阈值调节
    ├── LLM 开关
    └── 模型参数设置
```

---

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

---

## 🤖 Telegram Bot 配置

```
管理员 → 设置 → 填 Bot Token（找 @BotFather 获取）
     → 重启容器，Bot 自动启动

用户 → TG 绑定 → 点「生成验证码」
     → 在 TG 中发 /bind 验证码
     → 绑定成功

自动推送：
  ✅ 求片通过 → 通知提交者
  ✅ 求片驳回 → 通知提交者（含原因）
  ✅ 求片入库 → 通知提交者
  ✅ 工单回复 → 通知对方
  📢 TG 广播 → 管理员群发所有绑定用户
```

---

## 🔐 加密与安全

| 数据 | 加密方式 |
|------|----------|
| Emby API Key | PBKDF2-XOR + HMAC-SHA256 |
| SMTP 密码 | PBKDF2-XOR + HMAC-SHA256 |
| TG Bot Token | PBKDF2-XOR + HMAC-SHA256 |
| 用户密码 | PBKDF2-HMAC-SHA256（10 万轮） |
| Token 签名 | HMAC-SHA256（密钥派生自加密主密钥） |

### 安全特性

- 🛡️ **所有敏感密钥本地加密存储** — 加密密钥文件与数据库同卷但不同名，需同时获取两文件才能解密
- 🔄 **加密密钥自动推导路径** — 从 `DATABASE_URL` 目录自动定位，Docker 中持久化到 `/app/data/`
- 🚦 **登录速率限制** — 每 IP 5 分钟内最多 10 次尝试
- 🔐 **Token 双模式认证** — 支持 `Authorization: Bearer` Header（优先）+ 旧版 `?token=` Query 兼容
- ⏳ **Token 过期机制** — 7 天自动过期，密钥派生自主加密密钥（非硬编码）
- 🔑 **密码最短 8 位** — 仅 PBKDF2 哈希，移除 SHA256 回退，防彩虹表

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

不设置则自动生成密钥保存在 `./data/.encryption_key`。**备份数据时请同时备份此文件。**

> ⚠️ 加密密钥文件（`.encryption_key`）和数据库（`emby_monitor.db`）存放在同一卷但文件名不同。攻击者需同时获取这两个文件才可解密数据。

---

## 🛠️ API 概览（共 50+ 端点）

| 模块 | 端点 |
|------|------|
| 认证 | register / login / me / forgot-password / reset-password / update-profile |
| 仪表盘 | dashboard/summary |
| 实时流 | streams/active / streams/history |
| 媒体库 | library/stats / recently-added / codec-breakdown |
| 用户管理 | users/activity / users/manage\* / users/map |
| AI | ai/scan / ai/config / ai/settings / ai/logs |
| 评价 | media/review / media/reviews / media/my-reviews |
| 站点 | sites / sites/create / sites/test/{id} / sites/test-all |
| 工单 | tickets / tickets/create / tickets/{id} / tickets/{id}/reply / tickets/{id}/status |
| 签到 | checkin / checkin/status |
| 通知 | notify/config / notify/send / notify/logs |
| TMDB | tmdb/search / tmdb/trending / config/tmdb |
| 求片 | requests/create / requests/list / requests/vote / requests/approve/{id} / requests/reject/{id} / requests/downloaded/{id} |
| 卡密 | admin/cards/create / admin/cards/list / admin/cards/delete / card/validate |
| TG | tg/bind-code / tg/binding-status / tg/unbind / tg/broadcast |

---

## 🏗️ 项目结构

```
emby-monitor/
├── Dockerfile                    # 多阶段构建 (React → Python)
├── docker-compose.yml            # 单容器编排
├── backend/
│   ├── main.py                   # FastAPI 主服务 + 路由注册
│   ├── feature_routes.py         # 所有功能 API + Token 认证 + 限速
│   ├── tg_bot.py                 # Telegram Bot 轮询服务
│   ├── emby_client.py            # Emby API 封装
│   ├── emby_crypto.py            # PBKDF2-XOR 加密 + HMAC 签名
│   ├── ai_engine.py              # AI 规则引擎 + LLM 增强
│   ├── llm_client.py             # LLM API 客户端（OpenAI / DeepSeek / Moonshot）
│   ├── models.py                 # 16+ 个 SQLAlchemy 模型
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx               # 路由定义（18+ 页面）
│   │   ├── api/                  # API 客户端 + auth
│   │   ├── components/           # Layout / Toast / 通用组件
│   │   └── pages/                # 13+ 页面组件
│   │       ├── UserMap.tsx       # 📍 高德用户地图
│   │       ├── AiPanel.tsx       # 🤖 AI 扫描面板
│   │       ├── AiLogPanel.tsx    # 📋 AI 审计日志
│   │       └── ...
│   └── package.json
└── data/                         # SQLite + 密钥（自动创建，需备份）
```

---

## 🛠️ 技术栈

| 层 | 技术 |
|----|------|
| 后端 | Python 3.13 + FastAPI + SQLAlchemy + SQLite (aiosqlite) |
| 前端 | React 18 + TypeScript + Vite |
| 地图前端 | 高德地图 JS API 2.0 |
| 地图后端 | ip-api.com（免费 IP 地理解析） |
| 实时 | WebSocket (5s 轮询) |
| TG Bot | HTTP 长轮询 (httpx) |
| 加密 | PBKDF2-XOR + HMAC-SHA256 |
| 部署 | Docker 单容器 (~150MB) |
| AI | 内置规则引擎 + OpenAI / DeepSeek / Moonshot LLM 增强 |

---

## 🐳 运维命令

```bash
# 更新代码
docker compose down
docker compose build --no-cache
docker compose up -d

# 查看日志
docker compose logs -f

# 备份（数据库 + 加密密钥 — 两者缺一不可！）
cp -r data/ backup_$(date +%Y%m%d)/

# 进入容器
docker compose exec emby-monitor sh
```

---

## 📝 License

MIT
