"""Emby Monitor — FastAPI backend with real-time session tracking."""

from __future__ import annotations

import json
import logging
import os
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import Any

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from .emby_crypto import decrypt as crypto_decrypt
from .emby_crypto import encrypt as crypto_encrypt
from .emby_client import EmbyClient
from .feature_routes import router as feature_router
from .feature_routes import set_emby as set_features_emby
from .models import (
    ActivationCode,
    LibrarySnapshot,
    LoginCode,
    ServerConfig,
    SessionHistory,
    UserActivity,
    UserBinding,
    async_engine,
    close_active_sessions,
    get_session,
    init_db,
    record_library_snapshot,
    save_session_history,
)

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("emby-monitor")

# ── Global state ────────────────────────────────────────────────────

emby: EmbyClient | None = None
active_streams: dict[str, dict[str, Any]] = {}  # session_id -> data
ws_clients: set[WebSocket] = set()


@asynccontextmanager
async def lifespan(app: FastAPI):
    global emby
    await init_db()

    # Load saved config
    async for session in get_session():
        cfg = (await session.execute(select(ServerConfig))).scalar_one_or_none()
        if cfg:
            # Decrypt the stored API key (handle legacy plaintext too)
            raw_key = cfg.api_key
            decrypted = crypto_decrypt(raw_key)
            api_key = decrypted if decrypted else raw_key
            emby = EmbyClient(host=cfg.host, api_key=api_key)
            set_features_emby(emby)
            ok = await emby.health()
            if ok:
                await close_active_sessions(session)
                logger.info(f"Connected to Emby: {cfg.name} ({emby.server_version})")
            else:
                logger.warning("Saved Emby config unreachable")
        break

    yield

    if emby:
        await emby.close()
    await async_engine.dispose()


app = FastAPI(title="Emby Monitor", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include feature routes
app.include_router(feature_router)


# ── Serve SPA frontend (React build) ─────────────────────────────────

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")

SPA_PATHS = {"/", "/setup", "/admin", "/user"}


@app.get("/assets/{file_path:path}")
async def serve_assets(file_path: str):
    return FileResponse(os.path.join(FRONTEND_DIR, "assets", file_path))


@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    # API routes are handled by other endpoints
    if full_path.startswith("api/") or full_path.startswith("ws"):
        return {"error": "Not found"}
    # Serve index.html for all frontend routes (SPA)
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))


# ── Config endpoints ────────────────────────────────────────────────


@app.post("/api/config")
async def set_config(
    host: str = Query(...),
    api_key: str = Query(...),
    name: str = Query("My Emby"),
    db_session: AsyncSession = Depends(get_session),
):
    global emby

    client = EmbyClient(host=host, api_key=api_key)
    ok = await client.health()
    if not ok:
        return {"error": "Cannot connect to Emby server"}

    info = await client.get_system_info()
    emby = client
    set_features_emby(emby)

    # Save config with encrypted API key
    encrypted_key = crypto_encrypt(api_key)
    async with db_session.begin():
        await db_session.execute(text("DELETE FROM server_config"))
        cfg = ServerConfig(name=name, host=host, api_key=encrypted_key, version=info.get("Version", ""))
        db_session.add(cfg)

    logger.info(f"Connected to {name} ({info.get('Version','')})")

    return {
        "ok": True,
        "server_name": info.get("ServerName", ""),
        "version": info.get("Version", ""),
    }


@app.get("/api/config/status")
async def config_status():
    if emby and await emby.health():
        return {"connected": True, "name": emby.server_name, "version": emby.server_version}
    return {"connected": False}


@app.get("/api/config/masked")
async def config_masked(db_session: AsyncSession = Depends(get_session)):
    """Return config with masked secrets for frontend display."""
    from .emby_crypto import mask as crypto_mask
    if not emby:
        return {"connected": False}
    result = await db_session.execute(select(ServerConfig))
    cfg = result.scalar_one_or_none()
    return {
        "connected": True,
        "name": cfg.name if cfg else "",
        "host": cfg.host if cfg else "",
        "api_key": crypto_mask(cfg.api_key) if cfg else "",
        "version": emby.server_version,
    }


# ── Dashboard data endpoints ────────────────────────────────────────


@app.get("/api/dashboard/summary")
async def dashboard_summary(db_session: AsyncSession = Depends(get_session)):
    """Return the current dashboard snapshot."""
    global active_streams

    if not emby:
        return {"error": "Not connected"}

    streams = await emby.get_active_streams()
    users = await emby.get_users()
    lib_stats = await emby.get_library_stats()

    # Compute user online counts
    active_user_ids = {s.get("UserId") for s in streams if s.get("UserId")}
    online_users = len(active_user_ids)
    total_users = len(users)

    # Compute transcode stats
    transcoding_now = sum(
        1 for s in streams if s.get("TranscodingInfo") is not None
    )
    direct_play = len(streams) - transcoding_now

    # Bandwidth estimate
    total_bitrate = sum(
        (s.get("NowPlayingItem", {}) or {})
        .get("MediaSources", [{}])[0]
        .get("Bitrate", 0)
        or 0
        for s in streams
    )

    # Today's activity
    today = datetime.utcnow().strftime("%Y-%m-%d")
    result = await db_session.execute(
        select(func.sum(UserActivity.play_count)).where(UserActivity.date == today)
    )
    today_plays = result.scalar() or 0

    return {
        "active_streams": len(streams),
        "online_users": online_users,
        "total_users": total_users,
        "transcoding_now": transcoding_now,
        "direct_play": direct_play,
        "total_bitrate_kbps": total_bitrate // 1000,
        "total_items": lib_stats.get("total_items", 0),
        "total_size_gb": round(lib_stats.get("total_size_bytes", 0) / (1024**3), 1),
        "today_plays": today_plays,
    }


@app.get("/api/streams/active")
async def get_active_streams():
    if not emby:
        return {"error": "Not connected", "streams": []}

    streams = await emby.get_active_streams()
    return {"streams": streams}


@app.get("/api/streams/history")
async def get_stream_history(
    limit: int = Query(100),
    db_session: AsyncSession = Depends(get_session),
):
    result = await db_session.execute(
        select(SessionHistory)
        .order_by(SessionHistory.created_at.desc())
        .limit(limit)
    )
    rows = result.scalars().all()
    return {
        "history": [
            {
                "id": r.id,
                "user_name": r.user_name,
                "item_name": r.item_name,
                "item_type": r.item_type,
                "client": r.client,
                "device": r.device,
                "started_at": r.started_at.isoformat() if r.started_at else None,
                "ended_at": r.ended_at.isoformat() if r.ended_at else None,
                "duration_seconds": r.duration_seconds,
                "play_method": r.play_method,
                "transcoding": r.transcoding,
            }
            for r in rows
        ]
    }


@app.get("/api/library/stats")
async def library_stats(db_session: AsyncSession = Depends(get_session)):
    if not emby:
        return {"error": "Not connected"}

    lib = await emby.get_library_stats()

    # Snapshot history for trend
    result = await db_session.execute(
        select(LibrarySnapshot).order_by(LibrarySnapshot.taken_at.desc()).limit(30)
    )
    snapshots = result.scalars().all()

    return {
        "current": {
            "movies": lib["movies"]["count"],
            "series": lib["series"]["count"],
            "episodes": lib["episodes"]["count"],
            "tracks": lib["tracks"]["count"],
            "total_items": lib["total_items"],
            "total_size_gb": round(lib["total_size_bytes"] / (1024**3), 2),
            "movie_size_gb": round(lib["movies"]["size_bytes"] / (1024**3), 2),
            "series_size_gb": round(lib["series"]["size_bytes"] / (1024**3), 2),
            "episode_size_gb": round(lib["episodes"]["size_bytes"] / (1024**3), 2),
            "track_size_gb": round(lib["tracks"]["size_bytes"] / (1024**3), 2),
        },
        "trend": [
            {
                "date": s.taken_at.strftime("%Y-%m-%d"),
                "total_items": s.total_items,
                "total_size_gb": round(s.total_size_bytes / (1024**3), 2),
                "movies": s.movie_count,
                "series": s.series_count,
                "episodes": s.episode_count,
                "tracks": s.track_count,
            }
            for s in reversed(snapshots)
        ],
    }


@app.get("/api/users/activity")
async def user_activity(
    days: int = Query(7),
    db_session: AsyncSession = Depends(get_session),
):
    if not emby:
        return {"error": "Not connected"}

    cutoff = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d")

    # Daily aggregate from stored data
    result = await db_session.execute(
        select(UserActivity)
        .where(UserActivity.date >= cutoff)
        .order_by(UserActivity.date.desc(), UserActivity.play_count.desc())
    )
    rows = result.scalars().all()

    # Group by date
    by_date: dict[str, list] = defaultdict(list)
    user_totals: dict[str, dict] = {}
    for r in rows:
        by_date[r.date].append(
            {
                "user_name": r.user_name,
                "play_count": r.play_count,
                "duration_seconds": r.duration_seconds,
                "unique_items": r.unique_items,
                "transcoded_count": r.transcoded_count,
            }
        )
        if r.user_name not in user_totals:
            user_totals[r.user_name] = {
                "play_count": 0,
                "duration_seconds": 0,
                "active_days": set(),
            }
        user_totals[r.user_name]["play_count"] += r.play_count
        user_totals[r.user_name]["duration_seconds"] += r.duration_seconds
        user_totals[r.user_name]["active_days"].add(r.date)

    # Compute active users today
    today = datetime.utcnow().strftime("%Y-%m-%d")
    today_active = len(by_date.get(today, []))

    return {
        "daily_plays": {date: sum(u["play_count"] for u in users) for date, users in sorted(by_date.items())},
        "daily_users": {date: len(users) for date, users in sorted(by_date.items())},
        "top_users": sorted(
            [
                {
                    "name": name,
                    "play_count": data["play_count"],
                    "hours": round(data["duration_seconds"] / 3600, 1),
                    "active_days": len(data["active_days"]),
                }
                for name, data in user_totals.items()
            ],
            key=lambda x: x["play_count"],
            reverse=True,
        )[:10],
        "today_active_users": today_active,
        "period_days": days,
    }


@app.get("/api/recently-added")
async def recently_added(limit: int = Query(20)):
    if not emby:
        return {"error": "Not connected"}
    items = await emby.get_recently_added(limit=limit)
    return {"items": items}


@app.get("/api/codec-breakdown")
async def codec_breakdown(db_session: AsyncSession = Depends(get_session)):
    """Breakdown of video/audio codecs across all recorded sessions."""
    result = await db_session.execute(
        select(
            SessionHistory.video_codec,
            func.count(SessionHistory.id).label("count"),
        )
        .where(SessionHistory.video_codec != "")
        .group_by(SessionHistory.video_codec)
        .order_by(func.count(SessionHistory.id).desc())
    )
    video = [{"codec": r[0], "count": r[1]} for r in result]

    result = await db_session.execute(
        select(
            SessionHistory.audio_codec,
            func.count(SessionHistory.id).label("count"),
        )
        .where(SessionHistory.audio_codec != "")
        .group_by(SessionHistory.audio_codec)
        .order_by(func.count(SessionHistory.id).desc())
    )
    audio = [{"codec": r[0], "count": r[1]} for r in result]

    result = await db_session.execute(
        select(
            SessionHistory.play_method,
            func.count(SessionHistory.id).label("count"),
        )
        .where(SessionHistory.play_method != "")
        .group_by(SessionHistory.play_method)
        .order_by(func.count(SessionHistory.id).desc())
    )
    methods = [{"method": r[0], "count": r[1]} for r in result]

    result = await db_session.execute(
        select(
            SessionHistory.client,
            func.count(SessionHistory.id).label("count"),
        )
        .where(SessionHistory.client != "")
        .group_by(SessionHistory.client)
        .order_by(func.count(SessionHistory.id).desc())
    )
    clients = [{"client": r[0], "count": r[1]} for r in result]

    result = await db_session.execute(
        select(
            SessionHistory.device,
            func.count(SessionHistory.id).label("count"),
        )
        .where(SessionHistory.device != "")
        .group_by(SessionHistory.device)
        .order_by(func.count(SessionHistory.id).desc())
    )
    devices = [{"device": r[0], "count": r[1]} for r in result]

    # Transcode ratio
    total = await db_session.execute(select(func.count(SessionHistory.id)))
    total_count = total.scalar() or 1
    transcoded = await db_session.execute(
        select(func.count(SessionHistory.id)).where(SessionHistory.transcoding == 1)
    )
    transcode_count = transcoded.scalar() or 0

    return {
        "video_codecs": video,
        "audio_codecs": audio,
        "play_methods": methods,
        "clients": clients,
        "devices": devices,
        "transcode_ratio": round(transcode_count / total_count * 100, 1),
        "total_sessions": total_count,
    }


# ── User Management ────────────────────────────────────────────────


@app.get("/api/users/manage")
async def get_users_manage(db_session: AsyncSession = Depends(get_session)):
    """List all Emby users with binding info."""
    if not emby:
        return {"error": "Not connected"}

    users = await emby.get_users_with_policy()

    # Fetch all bindings
    result = await db_session.execute(select(UserBinding))
    bindings = result.scalars().all()
    binding_map = {b.emby_user_id: b for b in bindings}

    # Enrich users with binding info
    enriched = []
    for u in users:
        bid = u["id"]
        binding = binding_map.get(bid)
        total_plays = 0
        result = await db_session.execute(
            select(func.count(SessionHistory.id)).where(SessionHistory.user_id == bid)
        )
        total_plays = result.scalar() or 0

        enriched.append({
            **u,
            "total_plays": total_plays,
            "binding": {
                "platform": binding.platform if binding else None,
                "platform_user_id": binding.platform_user_id if binding else None,
                "platform_username": binding.platform_username if binding else None,
                "note": binding.note if binding else None,
                "is_active": bool(binding.is_active) if binding else False,
                "binding_id": binding.id if binding else None,
            } if binding else None,
        })

    return {"users": enriched, "total": len(enriched)}


@app.post("/api/users/manage/create")
async def create_user(
    name: str = Query(...),
    password: str = Query(""),
    db_session: AsyncSession = Depends(get_session),
):
    """Create a new Emby user."""
    if not emby:
        return {"error": "Not connected"}

    try:
        result = await emby.create_user(name)
        user_id = result.get("Id", "")

        # Set password if provided
        if password and user_id:
            await emby.update_user_password(user_id, new_password=password)

        return {"ok": True, "user_id": user_id, "name": name}
    except Exception as e:
        return {"error": f"Failed to create user: {e}"}


@app.post("/api/users/manage/password")
async def set_user_password(
    user_id: str = Query(...),
    new_password: str = Query(""),
):
    """Set or reset a user's password."""
    if not emby:
        return {"error": "Not connected"}
    try:
        await emby.update_user_password(user_id, new_password=new_password)
        return {"ok": True}
    except Exception as e:
        return {"error": f"Failed: {e}"}


@app.delete("/api/users/manage/{user_id}")
async def delete_user(user_id: str):
    """Delete an Emby user."""
    if not emby:
        return {"error": "Not connected"}
    try:
        await emby.delete_user(user_id)
        return {"ok": True}
    except Exception as e:
        return {"error": f"Failed to delete user: {e}"}


@app.post("/api/users/manage/toggle")
async def toggle_user(
    user_id: str = Query(...),
    disable: bool = Query(True),
):
    """Enable or disable an Emby user."""
    if not emby:
        return {"error": "Not connected"}
    try:
        policy = {
            "IsDisabled": disable,
            "IsAdministrator": False,
            "IsHidden": False,
        }
        await emby.update_user_policy(user_id, policy)
        state = "disabled" if disable else "enabled"
        return {"ok": True, "state": state}
    except Exception as e:
        return {"error": f"Failed: {e}"}


@app.post("/api/users/manage/policy")
async def update_user_policy(
    user_id: str = Query(...),
    max_sessions: int = Query(0),
    remote_bitrate: int = Query(0),
    enable_all_folders: bool = Query(True),
    enable_all_devices: bool = Query(True),
):
    """Update user policy (permissions, limits)."""
    if not emby:
        return {"error": "Not connected"}
    try:
        # First get current policy
        user_data = await emby.get_user(user_id)
        current_policy = user_data.get("Policy", {})

        current_policy.update({
            "MaxActiveSessions": max_sessions,
            "RemoteClientBitrateLimit": remote_bitrate,
            "EnableAllFolders": enable_all_folders,
            "EnableAllDevices": enable_all_devices,
        })
        await emby.update_user_policy(user_id, current_policy)
        return {"ok": True}
    except Exception as e:
        return {"error": f"Failed: {e}"}


# ── User Bindings (Telegram, etc.) ─────────────────────────────────


@app.get("/api/bindings")
async def list_bindings(db_session: AsyncSession = Depends(get_session)):
    """List all external platform bindings."""
    result = await db_session.execute(select(UserBinding).order_by(UserBinding.platform))
    bindings = result.scalars().all()
    return {
        "bindings": [
            {
                "id": b.id,
                "emby_user_id": b.emby_user_id,
                "emby_username": b.emby_username,
                "platform": b.platform,
                "platform_user_id": b.platform_user_id,
                "platform_username": b.platform_username,
                "note": b.note,
                "is_active": bool(b.is_active),
                "created_at": b.created_at.isoformat() if b.created_at else None,
            }
            for b in bindings
        ]
    }


@app.post("/api/bindings/bind")
async def bind_user(
    emby_user_id: str = Query(...),
    emby_username: str = Query(""),
    platform: str = Query("telegram"),
    platform_user_id: str = Query(...),
    platform_username: str = Query(""),
    note: str = Query(""),
    db_session: AsyncSession = Depends(get_session),
):
    """Bind an Emby user to an external platform (Telegram, etc.)."""
    # Check if already bound
    result = await db_session.execute(
        select(UserBinding).where(UserBinding.emby_user_id == emby_user_id)
    )
    existing = result.scalar_one_or_none()
    if existing:
        existing.platform = platform
        existing.platform_user_id = platform_user_id
        existing.platform_username = platform_username
        existing.note = note if note else existing.note
        existing.is_active = 1
    else:
        binding = UserBinding(
            emby_user_id=emby_user_id,
            emby_username=emby_username,
            platform=platform,
            platform_user_id=platform_user_id,
            platform_username=platform_username,
            note=note,
            is_active=1,
        )
        db_session.add(binding)

    await db_session.commit()
    return {"ok": True}


@app.post("/api/bindings/unbind")
async def unbind_user(
    emby_user_id: str = Query(...),
    db_session: AsyncSession = Depends(get_session),
):
    """Remove a binding for an Emby user."""
    result = await db_session.execute(
        select(UserBinding).where(UserBinding.emby_user_id == emby_user_id)
    )
    binding = result.scalar_one_or_none()
    if binding:
        await db_session.delete(binding)
        await db_session.commit()
    return {"ok": True}


# ── Login Codes ────────────────────────────────────────────────────


@app.post("/api/login-codes/generate")
async def generate_login_code(
    emby_user_id: str = Query(...),
    emby_username: str = Query(""),
    password: str = Query(""),
    db_session: AsyncSession = Depends(get_session),
):
    """Generate a one-time login code for an Emby user."""
    import secrets

    code = secrets.token_hex(8).upper()
    login_code = LoginCode(
        code=code,
        emby_user_id=emby_user_id,
        emby_username=emby_username,
        password=password,
        expires_at=datetime.utcnow() + timedelta(hours=24),
    )
    db_session.add(login_code)
    await db_session.commit()
    return {"ok": True, "code": code, "expires_at": login_code.expires_at.isoformat()}


@app.get("/api/login-codes/list")
async def list_login_codes(db_session: AsyncSession = Depends(get_session)):
    """List all login codes."""
    result = await db_session.execute(
        select(LoginCode).order_by(LoginCode.created_at.desc()).limit(50)
    )
    codes = result.scalars().all()
    return {
        "codes": [
            {
                "id": c.id,
                "code": c.code,
                "emby_username": c.emby_username,
                "used": bool(c.used),
                "created_at": c.created_at.isoformat(),
                "expires_at": c.expires_at.isoformat(),
                "used_at": c.used_at.isoformat() if c.used_at else None,
            }
            for c in codes
        ]
    }


# ── Background polling (called from WebSocket) ──────────────────────


async def poll_and_broadcast():
    """Fetch active streams, update DB, broadcast to all WS clients."""
    global emby, active_streams

    if not emby:
        return

    try:
        streams = await emby.get_active_streams()
        current_ids = {s.get("Id") for s in streams if s.get("Id")}

        # Detect ended sessions
        ended = []
        for sid in list(active_streams.keys()):
            if sid not in current_ids:
                ended.append(active_streams[sid])

        active_streams = {s.get("Id"): s for s in streams if s.get("Id")}

        # Broadcast active streams
        payload = {
            "type": "streams_update",
            "streams": streams,
            "ended": ended,
            "count": len(streams),
            "timestamp": datetime.utcnow().isoformat(),
        }

        dead: list[WebSocket] = []
        for ws in ws_clients:
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            ws_clients.discard(ws)

    except Exception as e:
        logger.warning(f"Poll error: {e}")


# ── WebSocket ───────────────────────────────────────────────────────


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    ws_clients.add(ws)
    logger.info(f"WS client connected ({len(ws_clients)} total)")

    try:
        while True:
            data = await ws.receive_text()
            msg = json.loads(data)
            action = msg.get("action")

            if action == "ping":
                await ws.send_json({"type": "pong"})

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.warning(f"WS error: {e}")
    finally:
        ws_clients.discard(ws)
        logger.info(f"WS client disconnected ({len(ws_clients)} remaining)")


# ── Manual refresh endpoint (for non-WS clients) ────────────────────


@app.post("/api/refresh")
async def trigger_refresh(db_session: AsyncSession = Depends(get_session)):
    """Manually poll Emby and record library snapshot."""
    global emby
    if not emby:
        return {"error": "Not connected"}

    streams = await emby.get_active_streams()
    for s in streams:
        await save_session_history(db_session, s)

    # Record library snapshot (every 6 hours roughly)
    async with db_session.begin():
        last = await db_session.execute(
            select(LibrarySnapshot).order_by(LibrarySnapshot.taken_at.desc()).limit(1)
        )
        last_row = last.scalar_one_or_none()
        should_snapshot = True
        if last_row and (datetime.utcnow() - last_row.taken_at).total_seconds() < 21600:
            should_snapshot = False

        if should_snapshot:
            lib_stats = await emby.get_library_stats()
            await record_library_snapshot(db_session, lib_stats)

    # Update daily activity
    today = datetime.utcnow().strftime("%Y-%m-%d")
    user_streams = defaultdict(list)
    for s in streams:
        uid = s.get("UserId", "")
        uname = s.get("UserName", "")
        user_streams[(uid, uname)].append(s)

    async with db_session.begin():
        for (uid, uname), user_sessions in user_streams.items():
            # Update or create activity record
            result = await db_session.execute(
                select(UserActivity).where(
                    UserActivity.user_id == uid,
                    UserActivity.date == today,
                )
            )
            act = result.scalar_one_or_none()
            if not act:
                act = UserActivity(
                    user_id=uid,
                    user_name=uname,
                    date=today,
                )
                db_session.add(act)
            act.play_count += len(user_sessions)
            # Count unique items
            items = set()
            for s in user_sessions:
                now = s.get("NowPlayingItem") or {}
                items.add(now.get("Id", ""))
                if s.get("TranscodingInfo"):
                    act.transcoded_count += 1
            act.unique_items = len(items)
            # Estimate duration — in reality, we'd track start/end properly
            act.duration_seconds += 30  # Placeholder per poll cycle

    return {"ok": True, "active_streams": len(streams)}


# ── Helper for the background poll timer ────────────────────────────


@app.on_event("startup")
async def startup_poll():
    """No background task — polling driven by WS 'ping' or manual refresh."""
    pass


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
