"""SQLite database models for Emby Monitor."""

from __future__ import annotations

from datetime import datetime
from typing import AsyncGenerator

from sqlalchemy import Column, DateTime, Integer, String, Text, create_engine
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import DeclarativeBase

DATABASE_URL = "sqlite+aiosqlite:///data/emby_monitor.db"


class Base(DeclarativeBase):
    pass


# ════════════════════════════════════════════════════════════════════
# 1. Session History
# ════════════════════════════════════════════════════════════════════


class SessionHistory(Base):
    __tablename__ = "session_history"
    id = Column(Integer, primary_key=True, autoincrement=True)
    emby_session_id = Column(String(128), nullable=False)
    user_id = Column(String(64), nullable=False)
    user_name = Column(String(128), nullable=False)
    item_id = Column(String(64), nullable=False)
    item_name = Column(String(512), nullable=False)
    item_type = Column(String(32), nullable=False)
    client = Column(String(128), default="")
    device = Column(String(128), default="")
    ip_address = Column(String(45), default="")
    started_at = Column(DateTime, nullable=False)
    ended_at = Column(DateTime, nullable=True)
    duration_seconds = Column(Integer, default=0)
    play_method = Column(String(16), default="")
    container = Column(String(32), default="")
    video_codec = Column(String(32), default="")
    audio_codec = Column(String(32), default="")
    bitrate = Column(Integer, default=0)
    width = Column(Integer, default=0)
    height = Column(Integer, default=0)
    transcoding = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


# ════════════════════════════════════════════════════════════════════
# 2. User Activity
# ════════════════════════════════════════════════════════════════════


class UserActivity(Base):
    __tablename__ = "user_activity"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(64), nullable=False)
    user_name = Column(String(128), nullable=False)
    date = Column(String(10), nullable=False)
    play_count = Column(Integer, default=0)
    duration_seconds = Column(Integer, default=0)
    unique_items = Column(Integer, default=0)
    transcoded_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


# ════════════════════════════════════════════════════════════════════
# 3. Library Snapshot
# ════════════════════════════════════════════════════════════════════


class LibrarySnapshot(Base):
    __tablename__ = "library_snapshots"
    id = Column(Integer, primary_key=True, autoincrement=True)
    movie_count = Column(Integer, default=0)
    series_count = Column(Integer, default=0)
    episode_count = Column(Integer, default=0)
    track_count = Column(Integer, default=0)
    total_items = Column(Integer, default=0)
    total_size_bytes = Column(Integer, default=0)
    movie_size_bytes = Column(Integer, default=0)
    series_size_bytes = Column(Integer, default=0)
    episode_size_bytes = Column(Integer, default=0)
    track_size_bytes = Column(Integer, default=0)
    taken_at = Column(DateTime, default=datetime.utcnow)


# ════════════════════════════════════════════════════════════════════
# 4. Server Config (Emby connection)
# ════════════════════════════════════════════════════════════════════


class ServerConfig(Base):
    __tablename__ = "server_config"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(128), default="My Emby")
    host = Column(String(512), nullable=False)
    api_key = Column(String(128), nullable=False)
    version = Column(String(32), default="")
    connected_at = Column(DateTime, default=datetime.utcnow)


# ════════════════════════════════════════════════════════════════════
# 5. User Bindings (TG, etc.)
# ════════════════════════════════════════════════════════════════════


class UserBinding(Base):
    __tablename__ = "user_bindings"
    id = Column(Integer, primary_key=True, autoincrement=True)
    emby_user_id = Column(String(64), nullable=False, unique=True, index=True)
    emby_username = Column(String(128), nullable=False)
    platform = Column(String(32), nullable=False, default="telegram")
    platform_user_id = Column(String(128), nullable=False)
    platform_username = Column(String(128), default="")
    note = Column(String(256), default="")
    is_active = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ════════════════════════════════════════════════════════════════════
# 6. Login Codes (for Emby user registration)
# ════════════════════════════════════════════════════════════════════


class LoginCode(Base):
    __tablename__ = "login_codes"
    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(32), unique=True, nullable=False, index=True)
    emby_user_id = Column(String(64), nullable=False)
    emby_username = Column(String(128), nullable=False)
    password = Column(String(256), default="")
    used = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)


# ════════════════════════════════════════════════════════════════════
# 7. Panel User (local auth system)
# ════════════════════════════════════════════════════════════════════


class PanelUser(Base):
    __tablename__ = "panel_users"
    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(64), unique=True, nullable=False, index=True)
    email = Column(String(128), unique=True, nullable=False)
    password_hash = Column(String(256), nullable=False)
    role = Column(String(16), default="user")  # user, admin
    points = Column(Integer, default=0)
    is_active = Column(Integer, default=1)
    emby_username = Column(String(128), default="")       # linked Emby user
    emby_user_id = Column(String(64), default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)


class PasswordReset(Base):
    __tablename__ = "password_resets"
    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(128), nullable=False, index=True)
    code = Column(String(8), nullable=False)
    used = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)


# ════════════════════════════════════════════════════════════════════
# 8. Media Reviews
# ════════════════════════════════════════════════════════════════════


class MediaReview(Base):
    __tablename__ = "media_reviews"
    id = Column(Integer, primary_key=True, autoincrement=True)
    emby_item_id = Column(String(64), nullable=False, index=True)
    item_name = Column(String(512), nullable=False)
    item_type = Column(String(32), default="")
    panel_user_id = Column(Integer, nullable=False)
    username = Column(String(64), nullable=False)
    rating = Column(Integer, nullable=False)  # 1-5
    content = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ════════════════════════════════════════════════════════════════════
# 9. Site Routes (media server lines)
# ════════════════════════════════════════════════════════════════════


class SiteRoute(Base):
    __tablename__ = "site_routes"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(128), nullable=False)
    url = Column(String(512), nullable=False)
    route_type = Column(String(32), default="emby")  # emby, jellyfin, proxy, etc.
    status = Column(String(16), default="unknown")   # online, offline, unknown
    latency_ms = Column(Integer, default=0)
    api_key = Column(String(128), default="")
    note = Column(Text, default="")
    sort_order = Column(Integer, default=0)
    is_active = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_check = Column(DateTime, nullable=True)


# ════════════════════════════════════════════════════════════════════
# 10. Support Tickets
# ════════════════════════════════════════════════════════════════════


class SupportTicket(Base):
    __tablename__ = "support_tickets"
    id = Column(Integer, primary_key=True, autoincrement=True)
    panel_user_id = Column(Integer, nullable=False)
    username = Column(String(64), nullable=False)
    subject = Column(String(256), nullable=False)
    category = Column(String(64), default="general")  # general, account, technical, billing
    status = Column(String(16), default="open")       # open, in_progress, resolved, closed
    priority = Column(String(16), default="normal")   # low, normal, high, urgent
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)


class TicketMessage(Base):
    __tablename__ = "ticket_messages"
    id = Column(Integer, primary_key=True, autoincrement=True)
    ticket_id = Column(Integer, nullable=False, index=True)
    panel_user_id = Column(Integer, nullable=False)
    username = Column(String(64), nullable=False)
    content = Column(Text, nullable=False)
    is_admin = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


# ════════════════════════════════════════════════════════════════════
# 11. Check-in Records
# ════════════════════════════════════════════════════════════════════


class CheckinRecord(Base):
    __tablename__ = "checkin_records"
    id = Column(Integer, primary_key=True, autoincrement=True)
    panel_user_id = Column(Integer, nullable=False, index=True)
    checkin_date = Column(String(10), nullable=False)  # YYYY-MM-DD
    points_earned = Column(Integer, default=10)
    streak_count = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)


# ════════════════════════════════════════════════════════════════════
# 12. Notification Log
# ════════════════════════════════════════════════════════════════════


class NotificationLog(Base):
    __tablename__ = "notification_logs"
    id = Column(Integer, primary_key=True, autoincrement=True)
    panel_user_id = Column(Integer, nullable=True)
    channel = Column(String(16), nullable=False)   # email, telegram
    title = Column(String(256), nullable=False)
    content = Column(Text, default="")
    recipient = Column(String(256), nullable=False)
    status = Column(String(16), default="sent")    # sent, failed, pending
    error_msg = Column(String(512), default="")
    created_at = Column(DateTime, default=datetime.utcnow)


# ════════════════════════════════════════════════════════════════════
# 13. Panel Config (key-value settings)
# ════════════════════════════════════════════════════════════════════


class PanelConfig(Base):
    __tablename__ = "panel_config"
    id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String(128), unique=True, nullable=False, index=True)
    value = Column(Text, default="")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ════════════════════════════════════════════════════════════════════
# Engine & helpers
# ════════════════════════════════════════════════════════════════════

async_engine = create_async_engine(DATABASE_URL, echo=False)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSession(async_engine) as session:
        yield session


async def init_db():
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def save_session_history(session: AsyncSession, data: dict):
    from sqlalchemy import select

    now = data.get("NowPlayingItem") or {}
    transcoding = 1 if data.get("TranscodingInfo") else 0
    ms = (now.get("MediaSources") or [{}])[0]
    ti = data.get("TranscodingInfo") or {}

    result = await session.execute(
        select(SessionHistory).where(
            SessionHistory.emby_session_id == data.get("Id", ""),
            SessionHistory.ended_at.is_(None),
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.ended_at = datetime.utcnow()
        existing.duration_seconds = int((datetime.utcnow() - existing.started_at).total_seconds())
        existing.transcoding = transcoding
        existing.play_method = data.get("PlayState", {}).get("PlayMethod", "")
        existing.video_codec = ti.get("VideoCodec", "")
        existing.audio_codec = ti.get("AudioCodec", "")
        existing.bitrate = ms.get("Bitrate", 0) or 0
    else:
        rec = SessionHistory(
            emby_session_id=data.get("Id", ""),
            user_id=data.get("UserId", ""),
            user_name=data.get("UserName", ""),
            item_id=now.get("Id", ""),
            item_name=now.get("Name", ""),
            item_type=now.get("Type", ""),
            client=data.get("Client", ""),
            device=data.get("DeviceName", ""),
            ip_address=data.get("RemoteEndPoint", ""),
            started_at=datetime.utcnow(),
            play_method=data.get("PlayState", {}).get("PlayMethod", ""),
            container=ms.get("Container", ""),
            video_codec=ti.get("VideoCodec", ""),
            audio_codec=ti.get("AudioCodec", ""),
            bitrate=ms.get("Bitrate", 0) or 0,
            transcoding=transcoding,
        )
        session.add(rec)
    await session.commit()


async def close_active_sessions(session: AsyncSession):
    from sqlalchemy import update
    await session.execute(
        update(SessionHistory)
        .where(SessionHistory.ended_at.is_(None))
        .values(ended_at=datetime.utcnow())
    )
    await session.commit()


async def record_library_snapshot(session: AsyncSession, stats: dict):
    snap = LibrarySnapshot(
        movie_count=stats.get("movies", {}).get("count", 0),
        series_count=stats.get("series", {}).get("count", 0),
        episode_count=stats.get("episodes", {}).get("count", 0),
        track_count=stats.get("tracks", {}).get("count", 0),
        total_items=stats.get("total_items", 0),
        total_size_bytes=stats.get("total_size_bytes", 0),
        movie_size_bytes=stats.get("movies", {}).get("size_bytes", 0),
        series_size_bytes=stats.get("series", {}).get("size_bytes", 0),
        episode_size_bytes=stats.get("episodes", {}).get("size_bytes", 0),
        track_size_bytes=stats.get("tracks", {}).get("size_bytes", 0),
    )
    session.add(snap)
    await session.commit()
