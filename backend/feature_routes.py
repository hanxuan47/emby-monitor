"""Full-feature API routes — auth, media, tickets, checkin, sites, notify."""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import logging
import random
import smtplib
import string
from datetime import datetime, timedelta
from email.mime.text import MIMEText
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from .emby_crypto import decrypt as crypto_decrypt
from .emby_crypto import encrypt as crypto_encrypt
from .emby_crypto import hash_password, mask, verify_password
from .emby_client import EmbyClient
from .models import (
    ActivationCode,
    CheckinRecord,
    LoginCode,
    MediaRequest,
    MediaReview,
    NotificationLog,
    PanelConfig,
    PanelUser,
    PasswordReset,
    RequestVote,
    SessionHistory,
    SiteRoute,
    SupportTicket,
    TicketMessage,
    UserBinding,
    async_engine,
    get_session,
    init_db,
)

logger = logging.getLogger("emby-features")

router = APIRouter()

# Global emby reference (set by main.py)
emby: EmbyClient | None = None


def set_emby(client: EmbyClient | None):
    global emby
    emby = client


# ── Helpers ─────────────────────────────────────────────────────────


def gen_token(user_id: int, role: str) -> str:
    raw = f"{user_id}:{role}:{datetime.utcnow().isoformat()}:emby-monitor-secret"
    return hashlib.sha256(raw.encode()).hexdigest()


def decode_token(token: str) -> dict | None:
    try:
        parts = token.split(":")
        if len(parts) >= 2:
            return {"user_id": int(parts[0]), "role": parts[1]}
    except Exception:
        pass
    return None


async def hash_password(pw: str) -> str:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _hash_sync, pw)


def _hash_sync(pw: str) -> str:
    from .emby_crypto import hash_password as hp
    return hp(pw)


def verify_password(pw: str, hashed: str) -> bool:
    from .emby_crypto import verify_password as vp
    return vp(pw, hashed)


def gen_code(length: int = 6) -> str:
    return "".join(random.choices(string.digits, k=length))


def _notify_user_async(panel_user_id: int, title: str, content: str):
    """Fire-and-forget TG notification. Never blocks the response."""
    try:
        from .tg_bot import send_notify_to_user
        asyncio.ensure_future(send_notify_to_user(panel_user_id, title, content))
    except Exception:
        pass


async def _send_email(to: str, subject: str, body: str, db) -> str:
    """Send email via configured SMTP. Returns 'sent' or 'failed'."""
    try:
        result = await db.execute(
            select(PanelConfig).where(
                PanelConfig.key.in_(["smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_from"])
            )
        )
        configs = {r.key: r.value for r in result.scalars().all()}
        host = configs.get("smtp_host", "")
        port = int(configs.get("smtp_port", "587"))
        user = configs.get("smtp_user", "")
        pwd = configs.get("smtp_pass", "")
        from_addr = configs.get("smtp_from", user)

        if not host:
            logger.warning(f"SMTP not configured, would send: {subject} to {to}")
            return "sent_logged"

        # Decrypt password
        from .emby_crypto import decrypt as crypto_decrypt
        decrypted = crypto_decrypt(pwd)
        pwd = decrypted if decrypted else pwd

        msg = MIMEText(body, "plain", "utf-8")
        msg["Subject"] = subject
        msg["From"] = from_addr
        msg["To"] = to

        with smtplib.SMTP(host, port) as s:
            s.starttls()
            s.login(user, pwd)
            s.send_message(msg)
        return "sent"
    except Exception as e:
        logger.error(f"Email send failed: {e}")
        return "failed"


# ════════════════════════════════════════════════════════════════════
# AUTH — Registration / Login / Password Reset
# ════════════════════════════════════════════════════════════════════


@router.post("/api/auth/register")
async def register(
    username: str = Query(...),
    email: str = Query(...),
    password: str = Query(...),
    card_key: str = Query(default=""),
    db: AsyncSession = Depends(get_session),
):
    """Register a new panel user. First user auto-becomes admin.
    After admin exists, users must provide a valid card key."""
    if len(password) < 4:
        return {"error": "密码至少4位"}

    admin_exists = await db.execute(
        select(PanelUser).where(PanelUser.role == "admin").limit(1)
    )
    has_admin = admin_exists.scalar_one_or_none() is not None

    if has_admin:
        cfg_result = await db.execute(
            select(PanelConfig).where(PanelConfig.key == "registration_enabled")
        )
        cfg = cfg_result.scalar_one_or_none()
        if cfg and cfg.value == "0":
            return {"error": "注册已关闭"}

        # ── Require card key ──────────────────────────────────────
        if not card_key:
            return {"error": "注册需要卡密"}
        result = await db.execute(
            select(ActivationCode).where(
                ActivationCode.code == card_key.upper().strip(),
                ActivationCode.is_used == 0,
            )
        )
        ac = result.scalar_one_or_none()
        if not ac:
            return {"error": "卡密无效或已被使用"}
        if ac.expires_at and ac.expires_at < datetime.utcnow():
            return {"error": "卡密已过期"}

    existing = await db.execute(
        select(PanelUser).where(
            (PanelUser.username == username) | (PanelUser.email == email)
        )
    )
    if existing.scalar_one_or_none():
        return {"error": "用户名或邮箱已存在"}

    # First user becomes admin automatically
    admin_exists = await db.execute(
        select(PanelUser).where(PanelUser.role == "admin").limit(1)
    )
    is_first = admin_exists.scalar_one_or_none() is None

    user = PanelUser(
        username=username,
        email=email,
        password_hash=hash_password(password),
        role="admin" if is_first else "user",
    )
    db.add(user)
    await db.flush()

    # ── Mark card key as used ─────────────────────────────────────
    if has_admin and ac:
        ac.is_used = 1
        ac.used_by = user.id
        ac.used_at = datetime.utcnow()
        user.points = (user.points or 0) + (ac.points or 0)

    await db.commit()
    await db.refresh(user)

    return {
        "ok": True,
        "is_admin": is_first,
        "user": {"id": user.id, "username": user.username, "email": user.email, "role": user.role},
    }


@router.post("/api/auth/login")
async def login(
    username: str = Query(...),
    password: str = Query(...),
    db: AsyncSession = Depends(get_session),
):
    """Login and return auth token."""
    result = await db.execute(
        select(PanelUser).where(PanelUser.username == username)
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(password, user.password_hash):
        return {"error": "用户名或密码错误"}

    if not user.is_active:
        return {"error": "账号已被禁用"}

    # Extract values before commit to avoid expired-object access in async mode
    uid = user.id
    urole = user.role
    uname = user.username
    uemail = user.email
    upoints = user.points
    uemby_name = user.emby_username
    uemby_id = user.emby_user_id

    user.last_login = datetime.utcnow()
    await db.commit()

    token = gen_token(uid, urole)
    return {
        "ok": True,
        "token": token,
        "user": {
            "id": uid,
            "username": uname,
            "email": uemail,
            "role": urole,
            "points": upoints,
            "emby_username": uemby_name,
            "emby_user_id": uemby_id,
        },
    }


# ── Registration status & admin toggle ──────────────────────────────


@router.get("/api/auth/register-status")
async def register_status(db: AsyncSession = Depends(get_session)):
    """Check if registration is open."""
    result = await db.execute(
        select(PanelConfig).where(PanelConfig.key == "registration_enabled")
    )
    cfg = result.scalar_one_or_none()
    enabled = cfg is None or cfg.value != "0"

    admin_exists = await db.execute(
        select(PanelUser).where(PanelUser.role == "admin").limit(1)
    )
    return {"enabled": enabled, "has_admin": admin_exists.scalar_one_or_none() is not None}


@router.post("/api/admin/registration")
async def toggle_registration(
    token: str = Query(...),
    enabled: str = Query(...),
    db: AsyncSession = Depends(get_session),
):
    """Admin-only: toggle registration on/off."""
    decoded = decode_token(token)
    if not decoded:
        return {"error": "请先登录"}
    user = (await db.execute(select(PanelUser).where(PanelUser.id == decoded["user_id"]))).scalar_one_or_none()
    if not user or user.role != "admin":
        return {"error": "无权操作"}

    result = await db.execute(
        select(PanelConfig).where(PanelConfig.key == "registration_enabled")
    )
    cfg = result.scalar_one_or_none()
    if cfg:
        cfg.value = "1" if enabled == "1" else "0"
    else:
        db.add(PanelConfig(key="registration_enabled", value="1" if enabled == "1" else "0"))
    await db.commit()

    return {"ok": True, "enabled": enabled == "1"}


@router.get("/api/auth/me")
async def get_profile(
    token: str = Query(...),
    db: AsyncSession = Depends(get_session),
):
    """Get current user profile from token."""
    decoded = decode_token(token)
    if not decoded:
        return {"error": "Invalid token"}

    result = await db.execute(
        select(PanelUser).where(PanelUser.id == decoded["user_id"])
    )
    user = result.scalar_one_or_none()
    if not user:
        return {"error": "User not found"}

    return {
        "ok": True,
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role,
            "points": user.points,
            "emby_username": user.emby_username,
            "emby_user_id": user.emby_user_id,
        },
    }


@router.post("/api/auth/forgot-password")
async def forgot_password(
    email: str = Query(...),
    db: AsyncSession = Depends(get_session),
):
    """Send password reset code to email."""
    result = await db.execute(select(PanelUser).where(PanelUser.email == email))
    user = result.scalar_one_or_none()
    if not user:
        return {"ok": True, "message": "如果邮箱存在，重置码已发送"}  # Don't reveal existence

    code = gen_code()
    reset = PasswordReset(
        email=email,
        code=code,
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    )
    db.add(reset)
    await db.commit()

    status = await _send_email(email, "密码重置验证码", f"您的验证码是：{code}\n有效期15分钟。", db)
    logger.info(f"Password reset code for {email}: {code}")
    return {"ok": True, "code_logged": code, "message": "如果邮箱存在，重置码已发送"}


@router.post("/api/auth/reset-password")
async def reset_password(
    email: str = Query(...),
    code: str = Query(...),
    new_password: str = Query(...),
    db: AsyncSession = Depends(get_session),
):
    """Reset password using verification code."""
    if len(new_password) < 4:
        return {"error": "密码至少4位"}

    result = await db.execute(
        select(PasswordReset).where(
            PasswordReset.email == email,
            PasswordReset.code == code,
            PasswordReset.used == 0,
            PasswordReset.expires_at > datetime.utcnow(),
        )
    )
    reset = result.scalar_one_or_none()
    if not reset:
        return {"error": "验证码无效或已过期"}

    reset.used = 1
    result = await db.execute(select(PanelUser).where(PanelUser.email == email))
    user = result.scalar_one_or_none()
    if user:
        user.password_hash = hash_password(new_password)

    await db.commit()
    return {"ok": True, "message": "密码已重置"}


@router.post("/api/auth/update-profile")
async def update_profile(
    token: str = Query(...),
    emby_username: str = Query(""),
    emby_user_id: str = Query(""),
    db: AsyncSession = Depends(get_session),
):
    """Update panel user's linked Emby account."""
    decoded = decode_token(token)
    if not decoded:
        return {"error": "Invalid token"}

    result = await db.execute(select(PanelUser).where(PanelUser.id == decoded["user_id"]))
    user = result.scalar_one_or_none()
    if not user:
        return {"error": "User not found"}

    if emby_username:
        user.emby_username = emby_username
    if emby_user_id:
        user.emby_user_id = emby_user_id
    await db.commit()
    return {"ok": True}


# ════════════════════════════════════════════════════════════════════
# MEDIA — Reviews / Ratings
# ════════════════════════════════════════════════════════════════════


@router.get("/api/media/recent")
async def media_recent(limit: int = Query(30)):
    """Get recently added media. Reuses EmbyClient."""
    if not emby:
        return {"error": "Not connected", "items": []}
    items = await emby.get_recently_added(limit=limit)
    return {"items": items}


@router.post("/api/media/review")
async def add_review(
    token: str = Query(...),
    emby_item_id: str = Query(...),
    item_name: str = Query(""),
    item_type: str = Query(""),
    rating: int = Query(...),
    content: str = Query(""),
    db: AsyncSession = Depends(get_session),
):
    """Add or update a movie/show review."""
    decoded = decode_token(token)
    if not decoded:
        return {"error": "请先登录"}
    if rating < 1 or rating > 5:
        return {"error": "评分1-5"}

    result = await db.execute(select(PanelUser).where(PanelUser.id == decoded["user_id"]))
    user = result.scalar_one_or_none()
    if not user:
        return {"error": "User not found"}

    # Check existing review
    result = await db.execute(
        select(MediaReview).where(
            MediaReview.emby_item_id == emby_item_id,
            MediaReview.panel_user_id == user.id,
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        existing.rating = rating
        existing.content = content
    else:
        review = MediaReview(
            emby_item_id=emby_item_id,
            item_name=item_name,
            item_type=item_type,
            panel_user_id=user.id,
            username=user.username,
            rating=rating,
            content=content,
        )
        db.add(review)

    await db.commit()
    return {"ok": True}


@router.get("/api/media/reviews")
async def get_reviews(
    emby_item_id: str = Query(...),
    db: AsyncSession = Depends(get_session),
):
    """Get all reviews for a specific media item."""
    result = await db.execute(
        select(MediaReview)
        .where(MediaReview.emby_item_id == emby_item_id)
        .order_by(MediaReview.created_at.desc())
    )
    reviews = result.scalars().all()

    # Compute average
    avg = 0
    if reviews:
        avg = round(sum(r.rating for r in reviews) / len(reviews), 1)

    return {
        "reviews": [
            {
                "id": r.id,
                "username": r.username,
                "rating": r.rating,
                "content": r.content,
                "created_at": r.created_at.isoformat(),
            }
            for r in reviews
        ],
        "average_rating": avg,
        "total_reviews": len(reviews),
    }


@router.get("/api/media/my-reviews")
async def my_reviews(
    token: str = Query(...),
    db: AsyncSession = Depends(get_session),
):
    """Get all reviews by the current user."""
    decoded = decode_token(token)
    if not decoded:
        return {"error": "请先登录"}
    result = await db.execute(
        select(MediaReview)
        .where(MediaReview.panel_user_id == decoded["user_id"])
        .order_by(MediaReview.created_at.desc())
        .limit(50)
    )
    reviews = result.scalars().all()
    return {
        "reviews": [
            {"id": r.id, "item_name": r.item_name, "item_type": r.item_type,
             "rating": r.rating, "content": r.content,
             "created_at": r.created_at.isoformat()}
            for r in reviews
        ]
    }


# ════════════════════════════════════════════════════════════════════
# SITES — Route Management + Speed Test
# ════════════════════════════════════════════════════════════════════


@router.get("/api/sites")
async def list_sites(db: AsyncSession = Depends(get_session)):
    """List all site routes."""
    result = await db.execute(
        select(SiteRoute).order_by(SiteRoute.sort_order, SiteRoute.name)
    )
    routes = result.scalars().all()
    return {
        "sites": [
            {
                "id": r.id,
                "name": r.name,
                "url": r.url,
                "route_type": r.route_type,
                "status": r.status,
                "latency_ms": r.latency_ms,
                "note": r.note,
                "sort_order": r.sort_order,
                "is_active": bool(r.is_active),
                "last_check": r.last_check.isoformat() if r.last_check else None,
            }
            for r in routes
        ]
    }


@router.post("/api/sites/create")
async def create_site(
    name: str = Query(...),
    url: str = Query(...),
    route_type: str = Query("emby"),
    api_key: str = Query(""),
    note: str = Query(""),
    db: AsyncSession = Depends(get_session),
):
    """Add a new site route."""
    site = SiteRoute(name=name, url=url, route_type=route_type, api_key=api_key, note=note)
    db.add(site)
    await db.commit()
    await db.refresh(site)
    return {"ok": True, "id": site.id}


@router.delete("/api/sites/{site_id}")
async def delete_site(site_id: int, db: AsyncSession = Depends(get_session)):
    """Delete a site route."""
    result = await db.execute(select(SiteRoute).where(SiteRoute.id == site_id))
    site = result.scalar_one_or_none()
    if site:
        await db.delete(site)
        await db.commit()
    return {"ok": True}


@router.post("/api/sites/test/{site_id}")
async def test_site(site_id: int, db: AsyncSession = Depends(get_session)):
    """Test latency to a site route."""
    result = await db.execute(select(SiteRoute).where(SiteRoute.id == site_id))
    site = result.scalar_one_or_none()
    if not site:
        return {"error": "Site not found"}

    import httpx
    latency = -1
    status = "offline"
    try:
        start = datetime.utcnow()
        async with httpx.AsyncClient(timeout=10) as cl:
            resp = await cl.get(site.url)
        latency = int((datetime.utcnow() - start).total_seconds() * 1000)
        status = "online" if resp.status_code < 500 else "degraded"
    except Exception:
        pass

    site.latency_ms = latency
    site.status = status
    site.last_check = datetime.utcnow()
    await db.commit()

    return {"ok": True, "status": status, "latency_ms": latency}


@router.post("/api/sites/test-all")
async def test_all_sites(db: AsyncSession = Depends(get_session)):
    """Test latency to all active sites."""
    result = await db.execute(select(SiteRoute).where(SiteRoute.is_active == 1))
    sites = result.scalars().all()

    import httpx

    async def test_one(site: SiteRoute):
        try:
            start = datetime.utcnow()
            async with httpx.AsyncClient(timeout=8) as cl:
                resp = await cl.get(site.url)
            site.latency_ms = int((datetime.utcnow() - start).total_seconds() * 1000)
            site.status = "online" if resp.status_code < 500 else "degraded"
        except Exception:
            site.latency_ms = -1
            site.status = "offline"
        site.last_check = datetime.utcnow()

    await asyncio.gather(*[test_one(s) for s in sites])
    await db.commit()

    results = [
        {"id": s.id, "name": s.name, "status": s.status, "latency_ms": s.latency_ms}
        for s in sites
    ]
    return {"ok": True, "results": results}


# ════════════════════════════════════════════════════════════════════
# TICKETS — Support System
# ════════════════════════════════════════════════════════════════════


@router.post("/api/tickets/create")
async def create_ticket(
    token: str = Query(...),
    subject: str = Query(...),
    category: str = Query("general"),
    priority: str = Query("normal"),
    content: str = Query(...),
    db: AsyncSession = Depends(get_session),
):
    """Submit a new support ticket."""
    decoded = decode_token(token)
    if not decoded:
        return {"error": "请先登录"}
    result = await db.execute(select(PanelUser).where(PanelUser.id == decoded["user_id"]))
    user = result.scalar_one_or_none()
    if not user:
        return {"error": "User not found"}

    ticket = SupportTicket(
        panel_user_id=user.id,
        username=user.username,
        subject=subject,
        category=category,
        priority=priority,
        content=content,
    )
    db.add(ticket)
    await db.commit()
    await db.refresh(ticket)
    return {"ok": True, "ticket_id": ticket.id}


@router.get("/api/tickets")
async def list_tickets(
    token: str = Query(...),
    status_filter: str = Query(""),
    db: AsyncSession = Depends(get_session),
):
    """List tickets for the current user (or all for admin)."""
    decoded = decode_token(token)
    if not decoded:
        return {"error": "请先登录"}

    result = await db.execute(select(PanelUser).where(PanelUser.id == decoded["user_id"]))
    user = result.scalar_one_or_none()
    if not user:
        return {"error": "User not found"}

    query = select(SupportTicket)
    if user.role != "admin":
        query = query.where(SupportTicket.panel_user_id == user.id)
    if status_filter:
        query = query.where(SupportTicket.status == status_filter)
    query = query.order_by(SupportTicket.created_at.desc()).limit(50)

    result = await db.execute(query)
    tickets = result.scalars().all()

    return {
        "tickets": [
            {
                "id": t.id,
                "username": t.username,
                "subject": t.subject,
                "category": t.category,
                "status": t.status,
                "priority": t.priority,
                "created_at": t.created_at.isoformat(),
                "updated_at": t.updated_at.isoformat(),
            }
            for t in tickets
        ]
    }


@router.get("/api/tickets/{ticket_id}")
async def get_ticket(
    ticket_id: int,
    token: str = Query(...),
    db: AsyncSession = Depends(get_session),
):
    """Get ticket details with messages."""
    decoded = decode_token(token)
    if not decoded:
        return {"error": "请先登录"}
    result = await db.execute(select(PanelUser).where(PanelUser.id == decoded["user_id"]))
    user = result.scalar_one_or_none()
    if not user:
        return {"error": "User not found"}

    result = await db.execute(select(SupportTicket).where(SupportTicket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    if not ticket:
        return {"error": "Ticket not found"}
    if user.role != "admin" and ticket.panel_user_id != user.id:
        return {"error": "无权限查看"}

    result = await db.execute(
        select(TicketMessage)
        .where(TicketMessage.ticket_id == ticket_id)
        .order_by(TicketMessage.created_at)
    )
    messages = result.scalars().all()

    return {
        "ticket": {
            "id": ticket.id,
            "subject": ticket.subject,
            "category": ticket.category,
            "status": ticket.status,
            "priority": ticket.priority,
            "content": ticket.content,
            "created_at": ticket.created_at.isoformat(),
        },
        "messages": [
            {
                "id": m.id,
                "username": m.username,
                "content": m.content,
                "is_admin": bool(m.is_admin),
                "created_at": m.created_at.isoformat(),
            }
            for m in messages
        ],
    }


@router.post("/api/tickets/{ticket_id}/reply")
async def reply_ticket(
    ticket_id: int,
    token: str = Query(...),
    content: str = Query(...),
    db: AsyncSession = Depends(get_session),
):
    """Reply to a support ticket."""
    decoded = decode_token(token)
    if not decoded:
        return {"error": "请先登录"}
    result = await db.execute(select(PanelUser).where(PanelUser.id == decoded["user_id"]))
    user = result.scalar_one_or_none()
    if not user:
        return {"error": "User not found"}

    result = await db.execute(select(SupportTicket).where(SupportTicket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    if not ticket or (user.role != "admin" and ticket.panel_user_id != user.id):
        return {"error": "无权限"}

    msg = TicketMessage(
        ticket_id=ticket_id,
        panel_user_id=user.id,
        username=user.username,
        content=content,
        is_admin=1 if user.role == "admin" else 0,
    )
    db.add(msg)

    if user.role == "admin" and ticket.status == "open":
        ticket.status = "in_progress"
    if user.role != "admin" and ticket.status == "resolved":
        ticket.status = "open"

    await db.commit()

    # ── Auto TG push: notify the other party ──────────────────
    if user.role == "admin":
        _notify_user_async(ticket.panel_user_id, f"工单回复 💬",
            f"管理员回复了你的工单「<b>{ticket.subject}</b>」\n\n{content[:200]}")
    else:
        admin_result = await db.execute(
            select(PanelUser).where(PanelUser.role == "admin").limit(1)
        )
        admin_user = admin_result.scalar_one_or_none()
        if admin_user and admin_user.id != user.id:
            _notify_user_async(admin_user.id, f"用户工单回复 💬",
                f"<b>{user.username}</b> 回复了工单「<b>{ticket.subject}</b>」\n\n{content[:200]}")

    return {"ok": True}


@router.post("/api/tickets/{ticket_id}/status")
async def update_ticket_status(
    ticket_id: int,
    token: str = Query(...),
    status: str = Query(...),
    db: AsyncSession = Depends(get_session),
):
    """Update ticket status (admin only)."""
    decoded = decode_token(token)
    if not decoded:
        return {"error": "请先登录"}
    result = await db.execute(select(PanelUser).where(PanelUser.id == decoded["user_id"]))
    user = result.scalar_one_or_none()
    if not user or user.role != "admin":
        return {"error": "无权限"}

    result = await db.execute(select(SupportTicket).where(SupportTicket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    if not ticket:
        return {"error": "Ticket not found"}

    ticket.status = status
    if status in ("resolved", "closed"):
        ticket.resolved_at = datetime.utcnow()
    await db.commit()
    return {"ok": True}


# ════════════════════════════════════════════════════════════════════
# CHECK-IN — Daily Check-in + Points
# ════════════════════════════════════════════════════════════════════


@router.post("/api/checkin")
async def daily_checkin(
    token: str = Query(...),
    db: AsyncSession = Depends(get_session),
):
    """Daily check-in to earn points."""
    decoded = decode_token(token)
    if not decoded:
        return {"error": "请先登录"}
    result = await db.execute(select(PanelUser).where(PanelUser.id == decoded["user_id"]))
    user = result.scalar_one_or_none()
    if not user:
        return {"error": "User not found"}

    today = datetime.utcnow().strftime("%Y-%m-%d")

    # Check already checked in today
    result = await db.execute(
        select(CheckinRecord).where(
            CheckinRecord.panel_user_id == user.id,
            CheckinRecord.checkin_date == today,
        )
    )
    if result.scalar_one_or_none():
        return {"error": "今日已签到"}

    # Calculate streak
    yesterday = (datetime.utcnow() - timedelta(days=1)).strftime("%Y-%m-%d")
    result = await db.execute(
        select(CheckinRecord).where(
            CheckinRecord.panel_user_id == user.id,
            CheckinRecord.checkin_date == yesterday,
        )
    )
    last = result.scalar_one_or_none()
    streak = (last.streak_count if last else 0) + 1

    # Points: 10 base + streak bonus
    streak_bonus = min(streak * 2, 50)
    points_earned = 10 + streak_bonus

    record = CheckinRecord(
        panel_user_id=user.id,
        checkin_date=today,
        points_earned=points_earned,
        streak_count=streak,
    )
    db.add(record)
    user.points = (user.points or 0) + points_earned
    await db.commit()

    return {
        "ok": True,
        "points_earned": points_earned,
        "streak": streak,
        "total_points": user.points,
    }


@router.get("/api/checkin/status")
async def checkin_status(
    token: str = Query(...),
    db: AsyncSession = Depends(get_session),
):
    """Get check-in status for current user."""
    decoded = decode_token(token)
    if not decoded:
        return {"error": "请先登录"}
    result = await db.execute(select(PanelUser).where(PanelUser.id == decoded["user_id"]))
    user = result.scalar_one_or_none()
    if not user:
        return {"error": "User not found"}

    today = datetime.utcnow().strftime("%Y-%m-%d")

    result = await db.execute(
        select(CheckinRecord).where(
            CheckinRecord.panel_user_id == user.id,
            CheckinRecord.checkin_date == today,
        )
    )
    checked_in_today = result.scalar_one_or_none() is not None

    # Get recent history
    result = await db.execute(
        select(CheckinRecord)
        .where(CheckinRecord.panel_user_id == user.id)
        .order_by(CheckinRecord.checkin_date.desc())
        .limit(30)
    )
    history = result.scalars().all()

    return {
        "checked_in_today": checked_in_today,
        "total_points": user.points,
        "streak": history[0].streak_count if history else 0,
        "history": [
            {"date": r.checkin_date, "points": r.points_earned, "streak": r.streak_count}
            for r in history
        ],
    }


# ════════════════════════════════════════════════════════════════════
# NOTIFICATIONS — Email & Telegram
# ════════════════════════════════════════════════════════════════════


@router.get("/api/notify/config")
async def get_notify_config(db: AsyncSession = Depends(get_session)):
    """Get notification configuration."""
    result = await db.execute(
        select(PanelConfig).where(
            PanelConfig.key.in_([
                "smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_from",
                "tg_bot_token", "tg_chat_id",
            ])
        )
    )
    configs = {r.key: r.value for r in result.scalars().all()}

    # Decrypt sensitive fields
    raw_smtp = configs.get("smtp_pass", "")
    decrypted_smtp = crypto_decrypt(raw_smtp)
    smtp_pass = decrypted_smtp if decrypted_smtp else raw_smtp
    raw_tg = configs.get("tg_bot_token", "")
    decrypted_tg = crypto_decrypt(raw_tg)
    tg_token = decrypted_tg if decrypted_tg else raw_tg

    return {
        "smtp_host": configs.get("smtp_host", ""),
        "smtp_port": configs.get("smtp_port", "587"),
        "smtp_user": configs.get("smtp_user", ""),
        "smtp_pass": smtp_pass,
        "smtp_from": configs.get("smtp_from", ""),
        "tg_bot_token": tg_token,
        "tg_chat_id": configs.get("tg_chat_id", ""),
    }


@router.post("/api/notify/config")
async def save_notify_config(
    smtp_host: str = Query(""),
    smtp_port: str = Query("587"),
    smtp_user: str = Query(""),
    smtp_pass: str = Query(""),
    smtp_from: str = Query(""),
    tg_bot_token: str = Query(""),
    tg_chat_id: str = Query(""),
    db: AsyncSession = Depends(get_session),
):
    """Save notification configuration."""
    pairs = {
        "smtp_host": smtp_host,
        "smtp_port": smtp_port,
        "smtp_user": smtp_user,
        "smtp_pass": crypto_encrypt(smtp_pass) if smtp_pass else smtp_pass,
        "smtp_from": smtp_from,
        "tg_bot_token": crypto_encrypt(tg_bot_token) if tg_bot_token else tg_bot_token,
        "tg_chat_id": tg_chat_id,
    }
    for k, v in pairs.items():
        result = await db.execute(select(PanelConfig).where(PanelConfig.key == k))
        cfg = result.scalar_one_or_none()
        if cfg:
            cfg.value = v
        else:
            db.add(PanelConfig(key=k, value=v))
    await db.commit()
    return {"ok": True}


@router.post("/api/notify/send")
async def send_notification(
    token: str = Query(...),
    channel: str = Query("email"),
    title: str = Query(...),
    content: str = Query(""),
    recipient: str = Query(""),
    db: AsyncSession = Depends(get_session),
):
    """Send a notification via configured channel."""
    decoded = decode_token(token)
    if not decoded:
        return {"error": "请先登录"}
    result = await db.execute(select(PanelUser).where(PanelUser.id == decoded["user_id"]))
    user = result.scalar_one_or_none()
    if not user:
        return {"error": "User not found"}

    status = "sent"
    error_msg = ""
    to = recipient

    if channel == "email":
        to = to or user.email
        s = await _send_email(to, title, content, db)
        status = s
        if s == "failed":
            error_msg = "SMTP 配置错误"
    elif channel == "telegram":
        result = await db.execute(
            select(PanelConfig).where(PanelConfig.key == "tg_bot_token")
        )
        cfg = result.scalar_one_or_none()
        token_str = cfg.value if cfg else ""
        if not token_str:
            status = "failed"
            error_msg = "TG Bot Token 未配置"
        else:
            result = await db.execute(
                select(PanelConfig).where(PanelConfig.key == "tg_chat_id")
            )
            cid = result.scalar_one_or_none()
            chat_id = recipient or (cid.value if cid else "")

            import httpx
            try:
                async with httpx.AsyncClient(timeout=10) as cl:
                    resp = await cl.post(
                        f"https://api.telegram.org/bot{token_str}/sendMessage",
                        json={"chat_id": chat_id, "text": f"*{title}*\n\n{content}", "parse_mode": "Markdown"},
                    )
                if resp.status_code != 200:
                    status = "failed"
                    error_msg = f"TG API: {resp.text[:200]}"
            except Exception as e:
                status = "failed"
                error_msg = str(e)

    log = NotificationLog(
        panel_user_id=user.id,
        channel=channel,
        title=title,
        content=content,
        recipient=to,
        status=status,
        error_msg=error_msg,
    )
    db.add(log)
    await db.commit()

    return {"ok": status == "sent", "status": status, "error": error_msg}


@router.get("/api/notify/logs")
async def notify_logs(
    token: str = Query(...),
    limit: int = Query(50),
    db: AsyncSession = Depends(get_session),
):
    """Get notification history."""
    decoded = decode_token(token)
    if not decoded:
        return {"error": "请先登录"}
    result = await db.execute(
        select(NotificationLog)
        .where(NotificationLog.panel_user_id == decoded["user_id"])
        .order_by(NotificationLog.created_at.desc())
        .limit(limit)
    )
    logs = result.scalars().all()
    return {
        "logs": [
            {
                "id": l.id,
                "channel": l.channel,
                "title": l.title,
                "recipient": l.recipient,
                "status": l.status,
                "error_msg": l.error_msg,
                "created_at": l.created_at.isoformat(),
            }
            for l in logs
        ]
    }


# ════════════════════════════════════════════════════════════════════
# SESSIONS — View active Emby sessions
# ════════════════════════════════════════════════════════════════════


@router.get("/api/manage/sessions")
async def get_active_sessions_manage():
    """Get all active Emby sessions (already available via /api/streams/active)."""
    if not emby:
        return {"error": "Not connected", "sessions": []}
    sessions = await emby.get_sessions()
    return {"sessions": sessions}


@router.post("/api/manage/sessions/{session_id}/kick")
async def kick_session(session_id: str):
    """Kick/disconnect an active session (Emby API varies by version)."""
    if not emby:
        return {"error": "Not connected"}
    try:
        # Emby doesn't have a direct kick endpoint publicly documented
        # We report back to the user
        return {"ok": True, "message": f"Session {session_id} reported (manual kick may need Emby plugin)"}
    except Exception as e:
        return {"error": str(e)}


# ════════════════════════════════════════════════════════════════════
# TMDB — Search & Discovery
# ════════════════════════════════════════════════════════════════════


async def _get_tmdb_key(db: AsyncSession) -> str:
    """Get TMDB API key from config."""
    result = await db.execute(
        select(PanelConfig).where(PanelConfig.key == "tmdb_api_key")
    )
    cfg = result.scalar_one_or_none()
    return cfg.value if cfg else ""


@router.post("/api/config/tmdb")
async def set_tmdb_config(
    token: str = Query(...),
    api_key: str = Query(...),
    db: AsyncSession = Depends(get_session),
):
    """Save TMDB API key (admin only)."""
    decoded = decode_token(token)
    if not decoded:
        return {"error": "请先登录"}
    user = (await db.execute(select(PanelUser).where(PanelUser.id == decoded["user_id"]))).scalar_one_or_none()
    if not user or user.role != "admin":
        return {"error": "无权操作"}
    result = await db.execute(select(PanelConfig).where(PanelConfig.key == "tmdb_api_key"))
    cfg = result.scalar_one_or_none()
    if cfg:
        cfg.value = api_key
    else:
        db.add(PanelConfig(key="tmdb_api_key", value=api_key))
    await db.commit()
    return {"ok": True}


@router.get("/api/tmdb/search")
async def tmdb_search(
    q: str = Query(...),
    page: int = Query(1),
    db: AsyncSession = Depends(get_session),
):
    """Search TMDB for movies and TV shows."""
    key = await _get_tmdb_key(db)
    if not key:
        return {"error": "请先在设置中配置 TMDB API Key"}

    async with httpx.AsyncClient() as client:
        # Search movies
        movie_resp = await client.get(
            "https://api.themoviedb.org/3/search/movie",
            params={"api_key": key, "query": q, "language": "zh-CN", "page": page},
        )
        # Search TV
        tv_resp = await client.get(
            "https://api.themoviedb.org/3/search/tv",
            params={"api_key": key, "query": q, "language": "zh-CN", "page": page},
        )

    movies = movie_resp.json().get("results", [])[:8]
    tvs = tv_resp.json().get("results", [])[:8]

    def fmt(item, mtype):
        return {
            "tmdb_id": item["id"],
            "media_type": mtype,
            "title": item.get("title") or item.get("name") or "",
            "year": (item.get("release_date") or item.get("first_air_date") or "")[:4],
            "poster": f"https://image.tmdb.org/t/p/w200{item.get('poster_path')}" if item.get("poster_path") else "",
            "overview": (item.get("overview") or "")[:300],
            "vote_average": item.get("vote_average", 0),
        }

    return {
        "results": [fmt(m, "movie") for m in movies] + [fmt(t, "tv") for t in tvs],
    }


@router.get("/api/tmdb/trending")
async def tmdb_trending(
    page: int = Query(1),
    db: AsyncSession = Depends(get_session),
):
    """Get trending content from TMDB."""
    key = await _get_tmdb_key(db)
    if not key:
        return {"error": "请先配置 TMDB API Key"}

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://api.themoviedb.org/3/trending/all/week",
            params={"api_key": key, "language": "zh-CN", "page": page},
        )

    results = resp.json().get("results", [])[:20]
    return {
        "results": [
            {
                "tmdb_id": r["id"],
                "media_type": r.get("media_type", "movie"),
                "title": r.get("title") or r.get("name") or "",
                "year": (r.get("release_date") or r.get("first_air_date") or "")[:4],
                "poster": f"https://image.tmdb.org/t/p/w200{r.get('poster_path')}" if r.get("poster_path") else "",
                "vote_average": r.get("vote_average", 0),
            }
            for r in results
        ],
    }


# ════════════════════════════════════════════════════════════════════
# REQUESTS — 求片系统
# ════════════════════════════════════════════════════════════════════


@router.post("/api/requests/create")
async def create_request(
    token: str = Query(...),
    tmdb_id: int = Query(...),
    media_type: str = Query(...),
    title: str = Query(...),
    year: str = Query(""),
    poster_url: str = Query(""),
    overview: str = Query(""),
    db: AsyncSession = Depends(get_session),
):
    """Submit a new media request."""
    decoded = decode_token(token)
    if not decoded:
        return {"error": "请先登录"}

    # Check for duplicate
    existing = await db.execute(
        select(MediaRequest).where(
            MediaRequest.tmdb_id == tmdb_id,
            MediaRequest.status.in_(["pending", "approved"]),
        )
    )
    if existing.scalar_one_or_none():
        return {"error": "该影片已有待处理的求片"}

    req = MediaRequest(
        user_id=decoded["user_id"],
        tmdb_id=tmdb_id,
        media_type=media_type,
        title=title,
        year=year,
        poster_url=poster_url,
        overview=overview,
    )
    db.add(req)
    await db.commit()
    await db.refresh(req)

    return {"ok": True, "request": {"id": req.id, "status": req.status}}


@router.post("/api/requests/vote")
async def vote_request(
    token: str = Query(...),
    request_id: int = Query(...),
    db: AsyncSession = Depends(get_session),
):
    """Upvote a media request (one vote per user per request)."""
    decoded = decode_token(token)
    if not decoded:
        return {"error": "请先登录"}

    # Check if already voted
    existing = await db.execute(
        select(RequestVote).where(
            RequestVote.request_id == request_id,
            RequestVote.user_id == decoded["user_id"],
        )
    )
    if existing.scalar_one_or_none():
        return {"error": "你已经投过票了"}

    req = (await db.execute(select(MediaRequest).where(MediaRequest.id == request_id))).scalar_one_or_none()
    if not req:
        return {"error": "求片不存在"}

    vote = RequestVote(request_id=request_id, user_id=decoded["user_id"])
    req.vote_count = (req.vote_count or 0) + 1
    db.add(vote)
    await db.commit()

    return {"ok": True, "vote_count": req.vote_count}


@router.get("/api/requests/list")
async def list_requests(
    token: str = Query(...),
    status: str = Query(""),
    page: int = Query(1),
    limit: int = Query(20),
    db: AsyncSession = Depends(get_session),
):
    """List media requests. Admin sees all, users see their own."""
    decoded = decode_token(token)
    if not decoded:
        return {"error": "请先登录"}

    user = (await db.execute(select(PanelUser).where(PanelUser.id == decoded["user_id"]))).scalar_one_or_none()
    is_admin = user and user.role == "admin"

    query = select(MediaRequest)
    if status and status in ("pending", "approved", "rejected", "downloaded"):
        query = query.where(MediaRequest.status == status)
    if not is_admin:
        query = query.where(MediaRequest.user_id == decoded["user_id"])
    query = query.order_by(MediaRequest.created_at.desc()).offset((page - 1) * limit).limit(limit)

    result = await db.execute(query)
    requests = result.scalars().all()

    # Get voter info for admin
    voters = {}
    if is_admin and requests:
        rids = [r.id for r in requests]
        vr = await db.execute(select(RequestVote).where(RequestVote.request_id.in_(rids)))
        for v in vr.scalars().all():
            voters.setdefault(v.request_id, []).append(v.user_id)

    return {
        "requests": [
            {
                "id": r.id,
                "user_id": r.user_id,
                "tmdb_id": r.tmdb_id,
                "media_type": r.media_type,
                "title": r.title,
                "year": r.year,
                "poster_url": r.poster_url,
                "overview": r.overview,
                "status": r.status,
                "admin_note": r.admin_note,
                "vote_count": r.vote_count,
                "voter_ids": voters.get(r.id, []),
                "created_at": r.created_at.isoformat() if r.created_at else "",
            }
            for r in requests
        ],
        "total": len(requests),
    }


@router.post("/api/requests/approve/{request_id}")
async def approve_request(
    request_id: int,
    token: str = Query(...),
    note: str = Query(""),
    db: AsyncSession = Depends(get_session),
):
    """Admin: approve a media request."""
    decoded = decode_token(token)
    if not decoded:
        return {"error": "请先登录"}
    user = (await db.execute(select(PanelUser).where(PanelUser.id == decoded["user_id"]))).scalar_one_or_none()
    if not user or user.role != "admin":
        return {"error": "无权操作"}

    req = (await db.execute(select(MediaRequest).where(MediaRequest.id == request_id))).scalar_one_or_none()
    if not req:
        return {"error": "求片不存在"}

    req.status = "approved"
    if note:
        req.admin_note = note
    req.updated_at = datetime.utcnow()
    await db.commit()

    # ── Auto TG push ──────────────────────────────────────────
    _notify_user_async(req.user_id, "求片已通过 ✅",
        f"<b>{req.title}</b> ({req.year or '?'}) 已通过审批，准备入库。")

    return {"ok": True, "status": "approved"}


@router.post("/api/requests/reject/{request_id}")
async def reject_request(
    request_id: int,
    token: str = Query(...),
    note: str = Query(""),
    db: AsyncSession = Depends(get_session),
):
    """Admin: reject a media request."""
    decoded = decode_token(token)
    if not decoded:
        return {"error": "请先登录"}
    user = (await db.execute(select(PanelUser).where(PanelUser.id == decoded["user_id"]))).scalar_one_or_none()
    if not user or user.role != "admin":
        return {"error": "无权操作"}

    req = (await db.execute(select(MediaRequest).where(MediaRequest.id == request_id))).scalar_one_or_none()
    if not req:
        return {"error": "求片不存在"}

    req.status = "rejected"
    if note:
        req.admin_note = note
    req.updated_at = datetime.utcnow()
    await db.commit()

    # ── Auto TG push ──────────────────────────────────────────
    note_text = f"原因: {note}" if note else ""
    _notify_user_async(req.user_id, "求片未通过 ❌",
        f"<b>{req.title}</b> ({req.year or '?'}) 已被驳回。{note_text}")

    return {"ok": True, "status": "rejected"}


@router.post("/api/requests/downloaded/{request_id}")
async def mark_downloaded(
    request_id: int,
    token: str = Query(...),
    db: AsyncSession = Depends(get_session),
):
    """Admin: mark a request as downloaded."""
    decoded = decode_token(token)
    if not decoded:
        return {"error": "请先登录"}
    user = (await db.execute(select(PanelUser).where(PanelUser.id == decoded["user_id"]))).scalar_one_or_none()
    if not user or user.role != "admin":
        return {"error": "无权操作"}

    req = (await db.execute(select(MediaRequest).where(MediaRequest.id == request_id))).scalar_one_or_none()
    if not req:
        return {"error": "求片不存在"}

    req.status = "downloaded"
    req.updated_at = datetime.utcnow()
    await db.commit()

    # ── Auto TG push ──────────────────────────────────────────
    _notify_user_async(req.user_id, "求片已入库 📥",
        f"<b>{req.title}</b> ({req.year or '?'}) 已入库，可以去看了！")

    return {"ok": True, "status": "downloaded"}


# ════════════════════════════════════════════════════════════════════
# 卡密系统 API
# ════════════════════════════════════════════════════════════════════


def generate_card_code() -> str:
    """Generate a card key like EMBY-XXXX-XXXX-XXXX"""
    def _block() -> str:
        return ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))
    return f"EMBY-{_block()}-{_block()}-{_block()}"


@router.post("/api/admin/cards/create")
async def create_cards(
    token: str = Query(...),
    count: int = Query(default=1, ge=1, le=100),
    points: int = Query(default=0, ge=0),
    expire_days: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_session),
):
    """Admin: create batch of card keys."""
    decoded = decode_token(token)
    if not decoded:
        return {"error": "请先登录"}
    admin = (await db.execute(select(PanelUser).where(PanelUser.id == decoded["user_id"]))).scalar_one_or_none()
    if not admin or admin.role != "admin":
        return {"error": "无权操作"}

    expires_at = (datetime.utcnow() + timedelta(days=expire_days)) if expire_days > 0 else None
    created = []
    for _ in range(count):
        code = generate_card_code()
        # ensure uniqueness
        while (await db.execute(select(ActivationCode).where(ActivationCode.code == code))).scalar_one_or_none():
            code = generate_card_code()
        ac = ActivationCode(code=code, points=points, expires_at=expires_at, created_by=admin.id)
        db.add(ac)
        created.append(code)
    await db.commit()

    return {"ok": True, "count": len(created), "codes": created, "points": points}


@router.get("/api/admin/cards/list")
async def list_cards(
    token: str = Query(...),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_session),
):
    """Admin: list all card keys with pagination."""
    decoded = decode_token(token)
    if not decoded:
        return {"error": "请先登录"}
    admin = (await db.execute(select(PanelUser).where(PanelUser.id == decoded["user_id"]))).scalar_one_or_none()
    if not admin or admin.role != "admin":
        return {"error": "无权操作"}

    total = (await db.execute(select(func.count(ActivationCode.id)))).scalar()
    offset = (page - 1) * page_size
    results = await db.execute(
        select(ActivationCode).order_by(ActivationCode.created_at.desc()).offset(offset).limit(page_size)
    )
    cards = results.scalars().all()
    items = []
    for c in cards:
        used_by_name = ""
        if c.used_by:
            u = (await db.execute(select(PanelUser).where(PanelUser.id == c.used_by))).scalar_one_or_none()
            used_by_name = u.username if u else "(已删除)"
        items.append({
            "id": c.id,
            "code": c.code,
            "points": c.points,
            "is_used": c.is_used,
            "used_by_name": used_by_name,
            "used_at": c.used_at.isoformat() if c.used_at else None,
            "expires_at": c.expires_at.isoformat() if c.expires_at else None,
            "created_at": c.created_at.isoformat(),
        })

    return {"ok": True, "items": items, "total": total, "page": page, "page_size": page_size}


@router.post("/api/admin/cards/delete")
async def delete_cards(
    token: str = Query(...),
    ids: str = Query(...),  # comma-separated card IDs
    db: AsyncSession = Depends(get_session),
):
    """Admin: delete/invalidate card keys."""
    decoded = decode_token(token)
    if not decoded:
        return {"error": "请先登录"}
    admin = (await db.execute(select(PanelUser).where(PanelUser.id == decoded["user_id"]))).scalar_one_or_none()
    if not admin or admin.role != "admin":
        return {"error": "无权操作"}

    id_list = [int(x.strip()) for x in ids.split(",") if x.strip().isdigit()]
    for cid in id_list:
        ac = (await db.execute(select(ActivationCode).where(ActivationCode.id == cid))).scalar_one_or_none()
        if ac and ac.is_used == 0:
            await db.delete(ac)
    await db.commit()
    return {"ok": True, "deleted": len(id_list)}


@router.post("/api/card/validate")
async def validate_card(
    card_key: str = Query(...),
    db: AsyncSession = Depends(get_session),
):
    """Public: check if a card key is valid (without using it)."""
    ac = (await db.execute(
        select(ActivationCode).where(
            ActivationCode.code == card_key.upper().strip(),
            ActivationCode.is_used == 0,
        )
    )).scalar_one_or_none()
    if not ac:
        return {"ok": False, "error": "卡密无效或已被使用"}
    if ac.expires_at and ac.expires_at < datetime.utcnow():
        return {"ok": False, "error": "卡密已过期"}
    return {"ok": True, "points": ac.points}


# ════════════════════════════════════════════════════════════════════
# TG Bot 绑定 & 广播 API
# ════════════════════════════════════════════════════════════════════


@router.post("/api/tg/bind-code")
async def get_tg_bind_code(
    token: str = Query(...),
    db: AsyncSession = Depends(get_session),
):
    """Generate a one-time binding code for the current user."""
    decoded = decode_token(token)
    if not decoded:
        return {"error": "请先登录"}
    user = (await db.execute(select(PanelUser).where(PanelUser.id == decoded["user_id"]))).scalar_one_or_none()
    if not user:
        return {"error": "用户不存在"}

    from .tg_bot import generate_bind_code
    code = generate_bind_code(user.id)
    return {"ok": True, "code": code, "ttl_minutes": 5}


@router.get("/api/tg/binding-status")
async def get_tg_binding_status(
    token: str = Query(...),
    db: AsyncSession = Depends(get_session),
):
    """Check if the current user has bound Telegram."""
    decoded = decode_token(token)
    if not decoded:
        return {"error": "请先登录"}

    result = await db.execute(
        select(UserBinding).where(
            UserBinding.panel_user_id == decoded["user_id"],
            UserBinding.platform == "telegram",
        )
    )
    binding = result.scalar_one_or_none()
    if binding:
        return {
            "ok": True,
            "bound": True,
            "chat_id": binding.platform_user_id,
            "created_at": binding.created_at.isoformat() if binding.created_at else None,
            "note": binding.note or "",
        }
    return {"ok": True, "bound": False}


@router.post("/api/tg/unbind")
async def unbind_tg(
    token: str = Query(...),
    db: AsyncSession = Depends(get_session),
):
    """Unbind Telegram from the current user."""
    decoded = decode_token(token)
    if not decoded:
        return {"error": "请先登录"}

    result = await db.execute(
        select(UserBinding).where(
            UserBinding.panel_user_id == decoded["user_id"],
            UserBinding.platform == "telegram",
        )
    )
    binding = result.scalar_one_or_none()
    if not binding:
        return {"error": "未绑定 TG"}

    await db.delete(binding)
    await db.commit()
    return {"ok": True}


@router.post("/api/tg/broadcast")
async def tg_broadcast(
    token: str = Query(...),
    message: str = Query(...),
    db: AsyncSession = Depends(get_session),
):
    """Admin: broadcast message to all bound Telegram users."""
    decoded = decode_token(token)
    if not decoded:
        return {"error": "请先登录"}
    admin = (await db.execute(select(PanelUser).where(PanelUser.id == decoded["user_id"]))).scalar_one_or_none()
    if not admin or admin.role != "admin":
        return {"error": "无权操作"}

    # Get all TG bindings
    results = await db.execute(
        select(UserBinding).where(
            UserBinding.platform == "telegram",
            UserBinding.is_active == 1,
        )
    )
    bindings = results.scalars().all()

    if not bindings:
        return {"error": "没有已绑定的用户"}

    from .tg_bot import send_message
    success_count = 0
    for b in bindings:
        ok = await send_message(b.platform_user_id, f"📢 <b>系统公告</b>\n\n{message}")
        if ok:
            success_count += 1

    return {"ok": True, "sent": success_count, "total": len(bindings)}

