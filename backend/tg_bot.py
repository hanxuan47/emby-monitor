"""
Telegram Bot for Emby Monitor — background polling service.
Handles user binding and push notifications.
"""

from __future__ import annotations

import asyncio
import logging
import random
import string
from datetime import datetime, timedelta

import httpx

from .models import (
    ActivationCode,
    PanelConfig,
    PanelUser,
    UserBinding,
    async_engine,
    get_session,
)

logger = logging.getLogger("emby-tg-bot")

API_BASE = "https://api.telegram.org/bot"

# ── Globals ──────────────────────────────────────────────────────────

_running = False
_bot_token: str | None = None
# In-memory binding codes: {code: (panel_user_id, expires_at)}
_bind_codes: dict[str, tuple[int, datetime]] = {}


# ── Helpers ──────────────────────────────────────────────────────────


def _gen_code() -> str:
    """Generate a 6-digit binding code."""
    return "".join(random.choices(string.digits, k=6))


def _clean_expired_codes():
    now = datetime.utcnow()
    expired = [k for k, (_, exp) in _bind_codes.items() if exp < now]
    for k in expired:
        _bind_codes.pop(k, None)


# ── Bot API calls ────────────────────────────────────────────────────


async def _api(method: str, json: dict | None = None) -> dict | None:
    """Call Telegram Bot API."""
    if not _bot_token:
        return None
    url = f"{API_BASE}{_bot_token}/{method}"
    try:
        async with httpx.AsyncClient(timeout=10) as cl:
            resp = await cl.post(url, json=json or {})
        if resp.status_code == 200:
            data = resp.json()
            if data.get("ok"):
                return data
            logger.warning("TG API error %s: %s", method, data)
        else:
            logger.warning("TG API HTTP %s: %s", resp.status_code, resp.text[:200])
    except Exception as e:
        logger.error("TG API request failed: %s", e)
    return None


async def send_message(chat_id: str | int, text: str, parse_mode: str = "HTML") -> bool:
    """Send a message to a chat. Returns success."""
    from .emby_crypto import decrypt as crypto_decrypt

    token = _bot_token
    # If _bot_token not set, try reading from DB
    if not token:
        async with get_session() as db:
            result = await db.execute(
                PanelConfig.__table__.select().where(PanelConfig.key == "tg_bot_token")
            )
            cfg = result.fetchone()
            if cfg and cfg.value:
                try:
                    token = crypto_decrypt(cfg.value)
                except Exception:
                    token = cfg.value
            if not token:
                return False

    url = f"{API_BASE}{token}/sendMessage"
    try:
        async with httpx.AsyncClient(timeout=10) as cl:
            resp = await cl.post(
                url,
                json={
                    "chat_id": str(chat_id),
                    "text": text,
                    "parse_mode": parse_mode,
                    "disable_web_page_preview": True,
                },
            )
        return resp.status_code == 200
    except Exception:
        return False


async def send_notify_to_user(panel_user_id: int, title: str, content: str) -> bool:
    """Send notification to a bound user's Telegram."""
    from .emby_crypto import decrypt as crypto_decrypt

    async with get_session() as db:
        result = await db.execute(
            UserBinding.__table__.select().where(
                UserBinding.panel_user_id == panel_user_id,
                UserBinding.platform == "telegram",
            )
        )
        binding = result.fetchone()
        if not binding:
            return False
        chat_id = binding.platform_user_id

    text = f"🔔 <b>{title}</b>\n\n{content}"
    return await send_message(chat_id, text)


# ── Command handlers ─────────────────────────────────────────────────


async def _handle_start(chat_id: int, first_name: str):
    msg = (
        f"👋 你好, {first_name}！\n\n"
        "欢迎使用 <b>Emby Monitor</b> TG Bot\n\n"
        "可用命令：\n"
        "  /bind <b>验证码</b> — 绑定你的面板账号\n"
        "  /unbind — 解绑\n"
        "  /status — 查看绑定状态\n\n"
        "💡 验证码请在面板「TG 绑定」页面获取"
    )
    await send_message(chat_id, msg)


async def _handle_bind(chat_id: int, code: str, db_session):
    """Bind telegram chat to a panel user."""
    _clean_expired_codes()

    # Check if code exists
    entry = _bind_codes.get(code.upper().strip())
    if not entry:
        await send_message(chat_id, "❌ 验证码无效或已过期，请在面板重新获取")
        return
    panel_user_id, expires_at = entry
    if expires_at < datetime.utcnow():
        _bind_codes.pop(code.upper().strip(), None)
        await send_message(chat_id, "❌ 验证码已过期，请在面板重新获取")
        return

    # Check if this chat is already bound
    existing = await db_session.execute(
        UserBinding.__table__.select().where(
            UserBinding.platform == "telegram",
            UserBinding.platform_user_id == str(chat_id),
        )
    )
    if existing.fetchone():
        await send_message(chat_id, "❌ 这个 TG 账号已绑定到其他面板用户，请先 /unbind")
        return

    # Get panel user info
    result = await db_session.execute(
        PanelUser.__table__.select().where(PanelUser.id == panel_user_id)
    )
    user = result.fetchone()
    if not user:
        await send_message(chat_id, "❌ 用户不存在")
        return

    # Check if panel user already bound to another TG
    existing2 = await db_session.execute(
        UserBinding.__table__.select().where(
            UserBinding.panel_user_id == panel_user_id,
            UserBinding.platform == "telegram",
        )
    )
    if existing2.fetchone():
        await send_message(chat_id, "❌ 你的面板账号已绑定到其他 TG，请先在面板解绑")
        return

    # Create binding
    binding = UserBinding(
        panel_user_id=panel_user_id,
        platform="telegram",
        platform_user_id=str(chat_id),
        platform_username="",
        is_active=1,
    )
    db_session.add(binding)
    await db_session.commit()

    _bind_codes.pop(code.upper().strip(), None)
    await send_message(chat_id, f"✅ 绑定成功！\n面板用户: <b>{user.username}</b>\n\n从现在起你会收到通知推送。")


async def _handle_unbind(chat_id: int, db_session):
    result = await db_session.execute(
        UserBinding.__table__.select().where(
            UserBinding.platform == "telegram",
            UserBinding.platform_user_id == str(chat_id),
        )
    )
    binding = result.fetchone()
    if not binding:
        await send_message(chat_id, "❌ 你还没有绑定任何面板账号")
        return

    await db_session.execute(
        UserBinding.__table__.delete().where(UserBinding.id == binding.id)
    )
    await db_session.commit()
    await send_message(chat_id, "✅ 已解绑，不再接收推送通知")


async def _handle_status(chat_id: int, db_session):
    result = await db_session.execute(
        UserBinding.__table__.select().where(
            UserBinding.platform == "telegram",
            UserBinding.platform_user_id == str(chat_id),
        )
    )
    binding = result.fetchone()
    if not binding:
        await send_message(chat_id, "❌ 未绑定\n\n使用 /bind <b>验证码</b> 绑定面板账号")
        return

    result2 = await db_session.execute(
        PanelUser.__table__.select().where(PanelUser.id == binding.panel_user_id)
    )
    user = result2.fetchone()
    name = user.username if user else "(已删除)"
    bound_since = binding.created_at.strftime("%Y-%m-%d %H:%M") if binding.created_at else "?"
    await send_message(
        chat_id,
        f"📋 绑定状态\n\n"
        f"面板用户: <b>{name}</b>\n"
        f"绑定时间: {bound_since}\n"
        f"接收通知: ✅ 已开启",
    )


# ── Polling loop ─────────────────────────────────────────────────────


async def polling_loop(token: str):
    """Main polling loop — fetches updates and processes commands."""
    global _bot_token
    _bot_token = token
    offset = 0

    logger.info("TG Bot polling started")

    while _running:
        try:
            url = f"{API_BASE}{token}/getUpdates"
            async with httpx.AsyncClient(timeout=30) as cl:
                resp = await cl.post(url, json={"offset": offset, "timeout": 20})
            if resp.status_code != 200:
                await asyncio.sleep(5)
                continue

            data = resp.json()
            if not data.get("ok"):
                await asyncio.sleep(5)
                continue

            for update in data.get("result", []):
                offset = update["update_id"] + 1
                msg = update.get("message")
                if not msg:
                    continue

                chat_id = msg["chat"]["id"]
                text = (msg.get("text") or "").strip()
                first_name = msg["from"].get("first_name", "")

                if not text:
                    continue

                # ── Parse commands ──
                parts = text.split(maxsplit=1)
                cmd = parts[0].lower()

                async with get_session() as db:
                    if cmd == "/start":
                        await _handle_start(chat_id, first_name)
                    elif cmd == "/bind" and len(parts) > 1:
                        await _handle_bind(chat_id, parts[1], db)
                    elif cmd == "/unbind":
                        await _handle_unbind(chat_id, db)
                    elif cmd == "/status":
                        await _handle_status(chat_id, db)
                    else:
                        # Unknown command — show help
                        await send_message(
                            chat_id,
                            f"未知命令。可用命令：/start /bind <验证码> /unbind /status",
                        )

        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("Polling error: %s", e)
            await asyncio.sleep(5)

    logger.info("TG Bot polling stopped")


# ── Public API ────────────────────────────────────────────────────────


async def start_bot(token: str):
    """Start the bot polling in background."""
    global _running, _bot_token
    if _running:
        logger.warning("Bot already running")
        return
    _running = True
    _bot_token = token
    asyncio.ensure_future(polling_loop(token))


def stop_bot():
    """Stop the bot polling."""
    global _running
    _running = False


def generate_bind_code(panel_user_id: int, ttl_minutes: int = 5) -> str:
    """Generate a one-time binding code for a panel user."""
    _clean_expired_codes()
    code = _gen_code()
    while code in _bind_codes:
        code = _gen_code()
    _bind_codes[code] = (panel_user_id, datetime.utcnow() + timedelta(minutes=ttl_minutes))
    return code
