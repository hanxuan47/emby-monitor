# Emby Monitor

基于 **iOS 毛玻璃设计** 的全功能 Emby 影视管理面板。

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.12+-blue.svg)](https://python.org)
[![React](https://img.shields.io/badge/react-18-61dafb.svg)](https://react.dev)
[![Docker](https://img.shields.io/badge/docker-ready-2496ed.svg)](https://docker.com)

> React + FastAPI 全栈 | 20+ 功能模块 | 卡密注册 | AI 分析 | 用户地图 | 线路展示 | 公告 & Wiki | TG Bot | 全响应式

---

## ✨ 功能

### 🎯 核心监控

- **📊 仪表盘** — 活跃流、在线用户、媒体总数、今日播放
- **📺 实时流** — 谁在看什么、客户端/设备/IP、转码状态
- **📚 媒体库** — 电影/剧集/音乐统计、存储分布
- **🎞️ 编码分析** — 视频/音频编码分布、转码率
- **🆕 最近更新** — 最近添加的媒体

### 🌐 服务器线路

- **📡 多线路展示** — 标签（优化/直连/国内）、延迟、在线状态
- **⚡ 一键测速** — 单条或全部站点延迟检测
- **📢 公告系统** — 管理员发布，用户端折叠阅读
- **📖 Wiki 知识库** — 管理员编写文档，用户端目录 + 内容阅读

### 👥 用户系统

- **🔧 Emby 用户管理** — 创建/删除/启用/禁用
- **🔐 TG 验证改密** — 6 位验证码 + 12 位随机密码
- **⭐ 影片评价** — 5 星评分 + 评论
- **🎫 工单系统** — 提交/处理/分类/优先级

### 🎬 影视发现

- **🔍 TMDB 搜索** — 电影/剧集 + 本周热门
- **📋 求片系统** — 用户提交 → 审批/驳回 → 入库
- **👍 投票机制** — 热门优先处理

### 💳 会员 & 运营

- **🎴 卡密系统** — 批量生成，注册必填
- **✅ 每日签到** — 积分递增
- **🔔 通知管理** — SMTP 邮件 + Telegram
- **📢 TG 广播** — 群发所有绑定用户

### 🤖 AI 分析

- **🧠 AI 扫描** — 行为分析 → 异常/可疑/水军
- **📋 审计日志** — 历史记录 + 人工复核
- **⚙️ AI 配置** — 规则权重 + LLM（OpenAI / DeepSeek / Moonshot）

### 🌍 用户地图

- **📍 IP 地理分布** — 活跃会话 IP → 高德地图标记
- **🗺️ 深色地图** — 用户标记 + 信息弹窗（设备/ISP/播放内容）

### 🤖 Telegram Bot

- `/start` `/bind` `/unbind` `/status`
- 自动推送：求片状态、工单回复、密码验证码

---

## 🖥️ 界面

- **🍎 iOS 毛玻璃** — 三层质感：`subtle(16px)` / `ios(30px)` / `vibrant(40px)`
- **📱 全响应式** — 桌面侧栏 ↔ 手机汉堡菜单 + 底部 TabBar（pill 滑动指示器）
- **🌙 暗色主题** — 深色背景 + 光晕渐变
- **✨ 细腻动画** — 页面淡入、TabBar 底部滑入、pill 弹性滑动、按压回弹
- **🏗️ React 18 + TypeScript + Vite** — SPA 单页应用

---

## 🚀 快速开始

### 前置条件

- Docker & Docker Compose（或 1Panel）
- Emby 服务器（含 API Key）
- （可选）[TMDB API Key](https://www.themoviedb.org/settings/api)
- （可选）[Telegram Bot Token](https://t.me/BotFather)
- （可选）[高德地图 JS Key](https://console.amap.com/dev/key/app)

### 一键部署

```bash
git clone https://github.com/hanxuan47/emby-monitor.git
cd emby-monitor

# 1. 生成加密密钥（重要！）
python3 -c "import base64,os; print(base64.urlsafe_b64encode(os.urandom(32)).decode())"

# 2. 编辑 docker-compose.yml，取消 ENCRYPTION_KEY 注释并填入上一步生成的值

# 3. 启动
docker compose up -d

# 4. 访问 http://localhost:8000
```

### 1Panel 部署（傻瓜式）

#### 方法一：一键脚本（推荐）

```bash
# 在 1Panel → 终端 中执行（复制粘贴即可）
bash <(curl -fsSL https://raw.githubusercontent.com/hanxuan47/emby-monitor/main/install-1panel.sh)
```

脚本会自动完成：
1. 选择安装目录和端口
2. 生成加密密钥（请截图保存！）
3. 克隆项目代码
4. 生成编排文件

完成后，在 **1Panel → 容器 → 编排 → 导入编排** 粘贴生成的 `docker-compose.yml` 路径即可。

#### 方法二：手动编排导入（复制粘贴即用）

1. 1Panel → **容器** → **编排** → **创建编排**
2. 把下面内容**完整粘贴**，只改 `ENCRYPTION_KEY` 和端口（如需）：

```yaml
services:
  emby-monitor:
    image: python:3.12-slim
    container_name: emby-monitor
    ports:
      - "8000:8000"
    volumes:
      - ./emby-monitor:/app
      - ./emby-monitor-data:/app/data
    working_dir: /app
    command: >
      sh -c "
        mkdir -p /app/data;
        if [ ! -f /app/backend/main.py ]; then
          echo '>>> 首次运行，正在克隆项目...';
          apt-get update -qq && apt-get install -y -qq git &&
          git clone --depth 1 https://github.com/hanxuan47/emby-monitor.git /tmp/repo &&
          cp -r /tmp/repo/* /app/ &&
          cp -r /tmp/repo/.[!.]* /app/ 2>/dev/null || true &&
          rm -rf /tmp/repo &&
          echo '>>> 代码克隆完成';
        fi;
        echo '>>> 安装依赖 + 启动...';
        pip install -r backend/requirements.txt -q --no-cache-dir &&
        uvicorn backend.main:app --host 0.0.0.0 --port 8000
      "
    restart: unless-stopped
    environment:
      - TZ=Asia/Shanghai
      - DATABASE_URL=sqlite+aiosqlite:///app/data/emby_monitor.db
      - ENCRYPTION_KEY=改成你生成的密钥
```

3. 点击**确认** → 等待 1-2 分钟（首次需克隆代码+装依赖）

> 💡 编排中的 `./emby-monitor` 和 `./emby-monitor-data` 是相对路径，不需要改。只用改 `ENCRYPTION_KEY` 一行。

#### 方法三：容器手动创建

1. 1Panel → **容器** → **创建容器**
2. 填写以下信息：

| 字段 | 值 |
|------|-----|
| 镜像 | `python:3.12-slim` |
| 名称 | `emby-monitor` |
| 端口 | `8000:8000` |
| 挂载 ① | 项目目录 → `/app` |
| 挂载 ② | 数据目录 → `/app/data` |
| 工作目录 | `/app` |
| 命令 | `sh -c "pip install -r backend/requirements.txt -q --no-cache-dir && uvicorn backend.main:app --host 0.0.0.0 --port 8000"` |

3. 环境变量：

```
TZ=Asia/Shanghai
DATABASE_URL=sqlite+aiosqlite:///app/data/emby_monitor.db
ENCRYPTION_KEY=你生成的密钥
```

4. 点击**确认**启动

### 更新

```bash
git pull
docker compose down
docker compose build --no-cache
docker compose up -d
```

---

## 🎯 首次使用

```
1. 打开 http://localhost:8000
   → 首次访问显示管理员初始化页面

2. 注册管理员账号（用户名 + 邮箱 + ≥8位密码）
   → 第一个用户自动成为管理员，无需卡密

3. 登录 → 设置 → 连接 Emby
   → 地址: http://192.168.1.100:8096
   → API Key: Emby 后台 → 高级 → API 密钥

4. （可选）设置 → TMDB → 填入 API Key → 开启影视搜索

5. （可选）设置 → TG Bot Token → 填入 → 重启容器
   → Bot 自动启动，用户可绑定 TG

6. 设置 → 开放注册 → 生成卡密 → 分发给用户

7. 线路管理 → 添加服务器线路 + 标签（优化,直连,国内）

8. 公告/Wiki → 编写内容 → 用户端可见
```

---

## 🔐 安全

### 端点认证

| 端点类型 | 权限 |
|----------|------|
| 公开数据（仪表盘/实时流/媒体库） | 无需登录 |
| 用户敏感数据（用户列表/绑定信息） | 需登录 |
| 管理操作（创建用户/改密/线路/通知配置） | 需管理员 |

### SSRF 防护

站点测速功能内置 URL 校验，阻止访问：
- 内网地址：`10.0.0.0/8` `172.16.0.0/12` `192.168.0.0/16`
- 链路本地：`169.254.0.0/16`
- 特殊地址：`localhost` `metadata.google.internal`

### 加密

| 数据 | 算法 |
|------|------|
| Emby API Key / SMTP 密码 / TG Token | PBKDF2-XOR + HMAC-SHA256 |
| 用户密码 | PBKDF2-HMAC-SHA256（10 万轮） |
| Token 签名 | HMAC-SHA256（密钥派生自加密主密钥） |
| Token 过期 | 7 天自动过期 |

### 其他

- 🚦 登录速率限制 — 每 IP 5 分钟 10 次
- 🔐 Bearer Token 认证 — Header 优先，Query 兼容
- 🛡️ 加密密钥持久化 — 与数据库同卷，需两者同时获取才能解密

---

## 📁 项目结构

```
emby-monitor/
├── Dockerfile                    # 多阶段构建
├── docker-compose.yml            # Docker 编排（含健康检查）
├── docker-compose-1panel.yml     # 1Panel 兼容版
├── .env.example                  # 环境变量参考
├── backend/
│   ├── main.py                   # FastAPI + 后台轮询 + 健康检查
│   ├── feature_routes.py         # 65+ API 端点 + Token 认证 + 授权依赖
│   ├── tg_bot.py                 # Telegram Bot 长轮询
│   ├── emby_client.py            # Emby API 封装
│   ├── emby_crypto.py            # 加密/解密/密码哈希
│   ├── ai_engine.py              # AI 规则引擎
│   ├── llm_client.py             # LLM 客户端
│   ├── models.py                 # 20+ SQLAlchemy 模型（自动迁移）
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx               # 路由定义
│   │   ├── api/                  # API 客户端 + auth
│   │   ├── components/           # Layout / Toast / 毛玻璃组件
│   │   └── pages/                # 18 个页面组件
│   ├── tailwind.config.js        # 含 max-* 响应式变体插件
│   └── package.json
└── data/                         # SQLite + 加密密钥（需备份）
```

---

## 🛠️ 技术栈

| 层 | 技术 |
|----|------|
| 后端 | Python 3.12 + FastAPI + SQLAlchemy + aiosqlite |
| 前端 | React 18 + TypeScript + Vite + Tailwind CSS |
| 地图 | 高德地图 JS API 2.0 + ip-api.com |
| 实时 | WebSocket + 后台 60s 轮询 |
| TG Bot | HTTP 长轮询 (httpx) |
| 加密 | PBKDF2 + HMAC-SHA256 |
| 部署 | Docker 单容器 (~150MB) |
| AI | 规则引擎 + OpenAI / DeepSeek / Moonshot |

---

## 🐳 运维

```bash
# 健康检查
curl http://localhost:8000/health

# 查看日志
docker compose logs -f

# 备份（数据库 + 密钥，缺一不可！）
cp -r data/ backup_$(date +%Y%m%d)/

# 生成加密密钥
python3 -c "import base64,os; print(base64.urlsafe_b64encode(os.urandom(32)).decode())"

# 进入容器
docker compose exec emby-monitor sh
```

---

## ❓ 故障排查

| 问题 | 解决 |
|------|------|
| 页面空白 | 确认 `docker compose up -d` 后等 10 秒构建完成 |
| 无法连接 Emby | 检查地址格式 `http://IP:8096`，末尾不要有 `/` |
| TG Bot 不工作 | 确认已重启容器，查看日志 `docker compose logs` |
| 加密数据解密失败 | `ENCRYPTION_KEY` 与创建时不一致，检查 `docker-compose.yml` |
| 前端显示异常 | 清除浏览器缓存 (Ctrl+Shift+R) |
| 端口冲突 | 修改 `docker-compose.yml` 中 `8000:8000` 为其他端口 |

---

## 📝 License

MIT
