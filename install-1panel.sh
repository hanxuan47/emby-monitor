#!/bin/bash
# ============================================================
# Emby Monitor — 1Panel 傻瓜式一键安装
# ============================================================
# 用法: 复制下面一行到 1Panel 终端执行
#   bash <(curl -fsSL https://raw.githubusercontent.com/hanxuan47/emby-monitor/main/install-1panel.sh)
# 或者本地执行:
#   chmod +x install-1panel.sh && ./install-1panel.sh
# ============================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════╗"
echo "║     Emby Monitor — 1Panel 一键安装       ║"
echo "╚══════════════════════════════════════════╝"
echo -e "${NC}"

# ── 1. 选择安装目录 ──────────────────────────────────────
echo -e "${YELLOW}[1/5] 设置安装目录${NC}"
read -p "安装到哪个目录？(默认: /opt/emby-monitor): " INSTALL_DIR
INSTALL_DIR=${INSTALL_DIR:-/opt/emby-monitor}
echo -e "  安装目录: ${GREEN}${INSTALL_DIR}${NC}"

# ── 2. 选择端口 ──────────────────────────────────────────
echo ""
echo -e "${YELLOW}[2/5] 设置访问端口${NC}"
read -p "面板访问端口？(默认: 8000): " PANEL_PORT
PANEL_PORT=${PANEL_PORT:-8000}
echo -e "  访问端口: ${GREEN}${PANEL_PORT}${NC}"

# ── 3. 生成加密密钥 ──────────────────────────────────────
echo ""
echo -e "${YELLOW}[3/5] 生成加密密钥${NC}"
ENCRYPTION_KEY=$(python3 -c "import base64,os; print(base64.urlsafe_b64encode(os.urandom(32)).decode())" 2>/dev/null || \
                  openssl rand -base64 32 2>/dev/null || \
                  cat /dev/urandom | tr -dc 'a-zA-Z0-9' | head -c 32)
echo -e "  密钥: ${GREEN}${ENCRYPTION_KEY}${NC}"
echo -e "  ${YELLOW}⚠️  请保存此密钥！容器重建时需要用到${NC}"

# ── 4. 克隆项目 ──────────────────────────────────────────
echo ""
echo -e "${YELLOW}[4/5] 下载项目代码${NC}"

if [ -d "${INSTALL_DIR}/emby-monitor" ]; then
    echo "  项目目录已存在，正在更新..."
    cd "${INSTALL_DIR}/emby-monitor"
    git pull --ff-only 2>/dev/null || echo "  (跳过 git pull)"
else
    mkdir -p "${INSTALL_DIR}"
    cd "${INSTALL_DIR}"
    echo "  正在克隆..."
    git clone https://github.com/hanxuan47/emby-monitor.git
    cd emby-monitor
fi

# ── 5. 创建数据目录 + 生成编排文件 ──────────────────────
echo ""
echo -e "${YELLOW}[5/5] 创建编排文件${NC}"

# 创建数据持久化目录
mkdir -p "${INSTALL_DIR}/emby-monitor-data"

# 生成 docker-compose 编排内容
COMPOSE_FILE="${INSTALL_DIR}/docker-compose.yml"
cat > "${COMPOSE_FILE}" << COMPOSE_EOF
# ═══════════════════════════════════════════════
# Emby Monitor — 1Panel 编排配置 (自动生成)
# ═══════════════════════════════════════════════
# 在 1Panel → 容器 → 编排 → 导入此文件即可
# ═══════════════════════════════════════════════

services:
  emby-monitor:
    image: python:3.12-slim
    container_name: emby-monitor
    ports:
      - "${PANEL_PORT}:8000"
    volumes:
      - ${INSTALL_DIR}/emby-monitor:/app
      - ${INSTALL_DIR}/emby-monitor-data:/app/data
    working_dir: /app
    command: >
      sh -c "
        pip install -r backend/requirements.txt -q --no-cache-dir &&
        uvicorn backend.main:app --host 0.0.0.0 --port 8000
      "
    restart: unless-stopped
    environment:
      - TZ=Asia/Shanghai
      - DATABASE_URL=sqlite+aiosqlite:///app/data/emby_monitor.db
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
COMPOSE_EOF

echo -e "  编排文件: ${GREEN}${COMPOSE_FILE}${NC}"

# ── 完成 ────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗"
echo -e "║         🎉 安装准备完成！               ║"
echo -e "╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BLUE}📁 编排文件:${NC} ${COMPOSE_FILE}"
echo -e "  ${BLUE}🔑 加密密钥:${NC} ${ENCRYPTION_KEY}"
echo -e "  ${BLUE}🌐 访问地址:${NC} http://你的IP:${PANEL_PORT}"
echo ""
echo -e "${YELLOW}【接下来在 1Panel 面板操作】${NC}"
echo ""
echo -e "  ${BLUE}方法一：编排导入（推荐）${NC}"
echo -e "  1. 打开 1Panel → ${GREEN}容器${NC} → ${GREEN}编排${NC}"
echo -e "  2. 点击 ${GREEN}导入编排${NC}"
echo -e "  3. 粘贴以下路径或直接上传文件:"
echo -e "     ${YELLOW}${COMPOSE_FILE}${NC}"
echo -e "  4. 点击 ${GREEN}确认${NC} → 等待启动完成"
echo ""
echo -e "  ${BLUE}方法二：手动创建容器${NC}"
echo -e "  1. 打开 1Panel → ${GREEN}容器${NC} → ${GREEN}创建容器${NC}"
echo -e "  2. 镜像: ${YELLOW}python:3.12-slim${NC}"
echo -e "  3. 名称: ${YELLOW}emby-monitor${NC}"
echo -e "  4. 端口: ${YELLOW}${PANEL_PORT}:8000${NC}"
echo -e "  5. 挂载目录:"
echo -e "     ${YELLOW}${INSTALL_DIR}/emby-monitor${NC} → ${YELLOW}/app${NC}"
echo -e "     ${YELLOW}${INSTALL_DIR}/emby-monitor-data${NC} → ${YELLOW}/app/data${NC}"
echo -e "  6. 工作目录: ${YELLOW}/app${NC}"
echo -e "  7. 命令: 复制下面整段"
echo -e "     ${YELLOW}sh -c \"pip install -r backend/requirements.txt -q --no-cache-dir && uvicorn backend.main:app --host 0.0.0.0 --port 8000\"${NC}"
echo -e "  8. 环境变量:"
echo -e "     ${YELLOW}TZ=Asia/Shanghai${NC}"
echo -e "     ${YELLOW}DATABASE_URL=sqlite+aiosqlite:///app/data/emby_monitor.db${NC}"
echo -e "     ${YELLOW}ENCRYPTION_KEY=${ENCRYPTION_KEY}${NC}"
echo ""
echo -e "  ${BLUE}启动后访问:${NC} http://你的服务器IP:${PANEL_PORT}"
echo -e "  ${BLUE}健康检查:${NC} http://你的服务器IP:${PANEL_PORT}/health"
echo ""
