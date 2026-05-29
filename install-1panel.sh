#!/bin/bash
# ============================================================
# Emby Monitor — 1Panel 一键安装
# ============================================================
# 复制下面一行到 1Panel 终端即可:
#   curl -fsSL https://raw.githubusercontent.com/hanxuan47/emby-monitor/main/install-1panel.sh | bash
# ============================================================

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; NC='\033[0m'

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════╗"
echo "║     Emby Monitor — 1Panel 一键安装       ║"
echo "╚══════════════════════════════════════════╝"
echo -e "${NC}"

# ── 1. 目录 ──
echo -e "${YELLOW}▶ 安装目录（直接回车用默认）${NC}"
read -p "  路径 [/opt/emby-monitor]: " DIR
DIR=${DIR:-/opt/emby-monitor}
mkdir -p "$DIR"
echo -e "  ${GREEN}✓${NC} $DIR"

# ── 2. 端口 ──
echo ""
echo -e "${YELLOW}▶ 访问端口${NC}"
read -p "  端口 [8000]: " PORT
PORT=${PORT:-8000}
echo -e "  ${GREEN}✓${NC} $PORT"

# ── 3. 密钥 ──
echo ""
echo -e "${YELLOW}▶ 生成加密密钥${NC}"
KEY=$(python3 -c "import base64,os; print(base64.urlsafe_b64encode(os.urandom(32)).decode())" 2>/dev/null || 
      openssl rand -base64 32 2>/dev/null || 
      cat /dev/urandom | tr -dc 'a-zA-Z0-9+/=' | head -c 44)
echo -e "  ${GREEN}✓${NC} $KEY"
echo -e "  ${RED}⚠  请复制保存此密钥！重建容器时需要${NC}"

# ── 4. 生成编排 ──
echo ""
echo -e "${YELLOW}▶ 生成编排文件${NC}"

cat > "$DIR/docker-compose.yml" << EOF
# ═══════════════════════════════════════════════════════
# Emby Monitor（自动生成）
# 生成时间: $(date '+%Y-%m-%d %H:%M')
# ═══════════════════════════════════════════════════════

services:
  emby-monitor:
    image: python:3.12-slim
    container_name: emby-monitor
    ports:
      - "$PORT:8000"
    volumes:
      - $DIR/emby-monitor:/app
      - $DIR/emby-monitor-data:/app/data
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
        echo '>>> 安装 Python 依赖...';
        pip install -r backend/requirements.txt -q --no-cache-dir;
        echo '>>> 启动服务...';
        uvicorn backend.main:app --host 0.0.0.0 --port 8000
      "
    restart: unless-stopped
    environment:
      - TZ=Asia/Shanghai
      - DATABASE_URL=sqlite+aiosqlite:///app/data/emby_monitor.db
      - ENCRYPTION_KEY=$KEY
EOF

echo -e "  ${GREEN}✓${NC} $DIR/docker-compose.yml"

# ── 完成 ──
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗"
echo -e "║         🎉 准备完成！复制密钥后继续      ║"
echo -e "╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BLUE}🔑 加密密钥${NC}（请立即保存！）:"
echo -e "  ${YELLOW}$KEY${NC}"
echo ""
echo -e "  ${BLUE}📋 接下来操作:${NC}"
echo -e "  1. 打开 1Panel → ${GREEN}容器${NC} → ${GREEN}编排${NC} → ${GREEN}创建编排${NC}"
echo -e "  2. 点击 ${GREEN}导入${NC}，选择文件:"
echo -e "     ${YELLOW}$DIR/docker-compose.yml${NC}"
echo -e "  3. 点击 ${GREEN}确认${NC}"
echo -e ""
echo -e "  ${BLUE}🌐 启动后访问:${NC} http://你的IP:$PORT"
echo -e "  ${BLUE}🏥 健康检查:${NC} http://你的IP:$PORT/health"
echo ""
