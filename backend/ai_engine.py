"""
AI 智能分析引擎 — 规则驱动的用户行为分析与自动管控。
分析用户活跃度、观看模式、异常行为，支持自动禁用、TG推送、客户端限制等。
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

from sqlalchemy import func, select

from .models import (
    AiInsight,
    AiWhitelist,
    PanelConfig,
    PanelUser,
    SessionHistory,
    UserActivity,
)

from .llm_client import generate_user_analysis

logger = logging.getLogger("emby-ai")


async def run_analysis(db_session, emby=None) -> dict:
    """执行全量 AI 分析。"""
    config = await _load_config(db_session)
    if not config["enabled"]:
        return {"error": "AI 分析已关闭", "users_analyzed": 0, "insights_generated": 0}

    now = datetime.utcnow()
    users_analyzed = 0
    insights_generated = 0
    actions_taken = 0

    # 获取所有活跃用户
    result = await db_session.execute(select(PanelUser).where(PanelUser.is_active == 1))
    users = result.scalars().all()

    # 提取用户值（必须在 commit 之前！）
    user_cache = [(u.id, u.emby_user_id or "", u.username) for u in users]

    # 清除旧洞察
    await db_session.execute(AiInsight.__table__.delete())
    await db_session.commit()

    for uid, eid, uname in user_cache:
        try:
            # ── 白名单检测 ──────────────────────────────────────────────
            if await _check_whitelist(db_session, users, uid, config):
                continue

            users_analyzed += 1

            # ── 1. 活跃度分析 ──────────────────────────────────────────
            insights = await _analyze_activity(db_session, uid, eid, config, now)
            for ins in insights:
                db_session.add(ins)
                insights_generated += 1

            # ── 2. 观看模式分析 ────────────────────────────────────────
            watch_insights = await _analyze_watch_patterns(db_session, uid, eid, config, now)
            for ins in watch_insights:
                db_session.add(ins)
                insights_generated += 1

            # ── 3. 异常行为检测 ────────────────────────────────────────
            anomaly_insights = await _detect_anomalies(db_session, uid, eid, config, now)
            for ins in anomaly_insights:
                db_session.add(ins)
                insights_generated += 1

            # ── 4. 多设备/IP 检测 ──────────────────────────────────────
            if config.get("multi_device_enabled", "0") == "1":
                dev_insights = await _detect_multi_device(db_session, uid, eid, config, now)
                for ins in dev_insights:
                    db_session.add(ins)
                    insights_generated += 1

            # ── 5. 客户端限制违规检测 ──────────────────────────────────
            if config.get("client_restrictions", "").strip():
                cl_insights = await _check_client_restrictions(db_session, uid, eid, config, now)
                for ins in cl_insights:
                    db_session.add(ins)
                    insights_generated += 1

            # ── 6. 个性化推荐 ──────────────────────────────────────────
            rec_insights = await _generate_recommendations(db_session, uid, eid, now)
            for ins in rec_insights:
                db_session.add(ins)
                insights_generated += 1

            # ── 7. LLM 增强分析 ────────────────────────────────────────
            if config.get("llm_enabled", "0") == "1":
                llm_insights = await _enrich_with_llm(db_session, uid, eid, uname, config, now)
                for ins in llm_insights:
                    db_session.add(ins)
                    insights_generated += 1
        except Exception as e:
            logger.error(f"Analysis failed for user #{uid} ({uname}): {e}")
            continue

    await db_session.commit()

    # ── 自动禁用 ⚡ (在洞察保存后，对所有 danger 用户执行) ──────
    if config.get("auto_disable_enabled", "0") == "1":
        actions_taken += await _enforce_auto_disable(db_session, config, emby)

    # ── TG推送 ────────────────────────────────────────────────────
    if config.get("tg_push_enabled", "0") == "1":
        await _send_tg_alerts(db_session, config)

    logger.info(f"AI analysis: {users_analyzed} users, {insights_generated} insights, {actions_taken} actions")
    return {
        "ok": True,
        "users_analyzed": users_analyzed,
        "insights_generated": insights_generated,
        "actions_taken": actions_taken,
        "timestamp": now.isoformat(),
    }


async def analyze_single_user(db_session, user: PanelUser, emby=None) -> list[AiInsight]:
    """Run analysis for a single user."""
    config = await _load_config(db_session)
    all_insights = []
    actions_taken = 0
    now = datetime.utcnow()

    uid = user.id
    eid = user.emby_user_id or ""

    if await _check_whitelist(db_session, [user] if isinstance(user, PanelUser) else user, uid, config):
        return []

    # Clear old insights for this user
    await db_session.execute(
        AiInsight.__table__.delete().where(AiInsight.panel_user_id == uid)
    )

    for analyzer in [_analyze_activity, _analyze_watch_patterns, _detect_anomalies, _generate_recommendations]:
        insights = await analyzer(db_session, uid, eid, config, now)
        for ins in insights:
            db_session.add(ins)
            all_insights.append(ins)

    if config.get("multi_device_enabled", "0") == "1":
        dev_insights = await _detect_multi_device(db_session, uid, eid, config, now)
        for ins in dev_insights:
            db_session.add(ins)
            all_insights.append(ins)

    if config.get("client_restrictions", "").strip():
        cl_insights = await _check_client_restrictions(db_session, uid, eid, config, now)
        for ins in cl_insights:
            db_session.add(ins)
            all_insights.append(ins)

    # ── LLM 增强 ──────────────────────────────────────────────────
    if config.get("llm_enabled", "0") == "1":
        llm_insights = await _enrich_with_llm(db_session, uid, eid, user.username, config, now)
        for ins in llm_insights:
            db_session.add(ins)
            all_insights.append(ins)

    await db_session.commit()

    if config.get("auto_disable_enabled", "0") == "1":
        actions_taken += await _enforce_auto_disable(db_session, config, emby)

    if config.get("tg_push_enabled", "0") == "1":
        await _send_tg_alerts(db_session, config)

    return all_insights


async def _load_config(db_session) -> dict:
    """Load AI config from panel_config."""
    result = await db_session.execute(
        select(PanelConfig).where(PanelConfig.key.like("ai_%"))
    )
    configs = {r.key: r.value for r in result.scalars().all()}
    return {
        "enabled": configs.get("ai_enabled", "1") == "1",
        "inactive_days": int(configs.get("ai_inactive_days", "14")),
        "auto_disable_days": int(configs.get("ai_auto_disable_days", "30")),
        "anomaly_threshold": int(configs.get("ai_anomaly_threshold", "5")),
        # 新功能
        "auto_disable_enabled": configs.get("ai_auto_disable_enabled", "0"),
        "tg_push_enabled": configs.get("ai_tg_push_enabled", "0"),
        "tg_admin_chat_id": configs.get("ai_tg_admin_chat_id", ""),
        "rate_limit_enabled": configs.get("ai_rate_limit_enabled", "0"),
        "rate_limit_max_requests": int(configs.get("ai_rate_limit_max_requests", "3")),
        "client_restrictions": configs.get("ai_client_restrictions", ""),
        "multi_device_enabled": configs.get("ai_multi_device_enabled", "0"),
        "multi_device_max_sessions": int(configs.get("ai_multi_device_max_sessions", "3")),
        "whitelist_mode": configs.get("ai_whitelist_mode", "disabled"),  # disabled / skip / skip_anomaly
        # LLM 分析
        "llm_enabled": configs.get("ai_llm_enabled", "0"),
        "llm_provider": configs.get("ai_llm_provider", "custom"),
        "llm_api_url": configs.get("ai_llm_api_url", ""),
        "llm_api_key": configs.get("ai_llm_api_key", ""),
        "llm_model": configs.get("ai_llm_model", "gpt-4o-mini"),
    }


# ── 白名单 ──────────────────────────────────────────────────────────


async def _check_whitelist(db_session, users, uid: int, config: dict) -> bool:
    """Check if user should be skipped based on whitelist."""
    mode = config.get("whitelist_mode", "disabled")
    if mode == "disabled":
        return False
    result = await db_session.execute(
        select(AiWhitelist).where(AiWhitelist.panel_user_id == uid, AiWhitelist.is_active == 1)
    )
    entry = result.scalar_one_or_none()
    if entry:
        if mode == "skip":
            return True  # 完全跳过
        elif mode == "skip_anomaly":
            # 只跳过异常检测
            pass
    return False


# ── 分析器 ──────────────────────────────────────────────────────────


async def _analyze_activity(db_session, uid: int, eid: str, config: dict, now: datetime) -> list[AiInsight]:
    """分析用户活跃度"""
    insights = []

    last_activity = await db_session.execute(
        select(UserActivity)
        .where(UserActivity.user_id == eid)
        .order_by(UserActivity.date.desc())
        .limit(1)
    )
    last = last_activity.scalar_one_or_none()

    if not last:
        insights.append(AiInsight(
            panel_user_id=uid, category="activity",
            title="🆕 新用户 - 暂无活动记录",
            content="该用户注册后尚未有任何播放记录，建议引导使用。",
            severity="info",
        ))
        return insights

    last_date = datetime.strptime(last.date, "%Y-%m-%d")
    days_since = (now - last_date).days

    thirty_days_ago = (now - timedelta(days=30)).strftime("%Y-%m-%d")
    result = await db_session.execute(
        select(
            func.sum(UserActivity.play_count),
            func.sum(UserActivity.duration_seconds),
            func.sum(UserActivity.unique_items),
            func.count(UserActivity.id),
        ).where(
            UserActivity.user_id == eid,
            UserActivity.date >= thirty_days_ago,
        )
    )
    stats = result.one()
    plays_30d = stats[0] or 0
    duration_30d = stats[1] or 0
    items_30d = stats[2] or 0
    active_days_30d = stats[3] or 0

    if days_since > config["inactive_days"]:
        severity = "warning" if days_since < config["auto_disable_days"] else "danger"
        auto_action = ""
        if days_since >= config["auto_disable_days"]:
            auto_action = "suggest_disable"
        insights.append(AiInsight(
            panel_user_id=uid, category="activity",
            title=f"⏳ 用户 {days_since} 天未活动",
            content=f"最后活动: {last.date}。30天内播放 {plays_30d} 次，观看 {duration_30d//3600} 小时，{items_30d} 个不同内容，活跃 {active_days_30d} 天。",
            severity=severity,
            auto_action=auto_action,
        ))
    else:
        hours = duration_30d // 3600
        daily_avg = round(plays_30d / max(active_days_30d, 1), 1)
        insights.append(AiInsight(
            panel_user_id=uid, category="activity",
            title=f"📊 月度活跃报告",
            content=f"过去30天播放 {plays_30d} 次（日均 {daily_avg}），观看 {hours} 小时，{items_30d} 个不同内容，活跃 {active_days_30d} 天。",
            severity="info",
        ))

    return insights


async def _analyze_watch_patterns(db_session, uid: int, eid: str, config: dict, now: datetime) -> list[AiInsight]:
    """分析观看模式"""
    insights = []

    result = await db_session.execute(
        select(SessionHistory)
        .where(SessionHistory.user_id == eid)
        .order_by(SessionHistory.started_at.desc())
        .limit(50)
    )
    sessions = result.scalars().all()

    if not sessions:
        return insights

    total = len(sessions)
    transcoded = sum(1 for s in sessions if s.transcoding)
    transcode_rate = round(transcoded / total * 100) if total > 0 else 0

    if transcode_rate > 50:
        insights.append(AiInsight(
            panel_user_id=uid, category="watch",
            title=f"🎞️ 转码率偏高 ({transcode_rate}%)",
            content=f"最近 {total} 次播放中有 {transcoded} 次触发了转码。建议检查客户端兼容性或网络带宽。",
            severity="warning",
            auto_action="suggest_upgrade",
        ))

    # 常用客户端
    clients = {}
    for s in sessions:
        c = s.client or "Unknown"
        clients[c] = clients.get(c, 0) + 1
    if clients:
        top_client = max(clients, key=clients.get)
        insights.append(AiInsight(
            panel_user_id=uid, category="watch",
            title=f"📱 常用客户端: {top_client}",
            content=f"使用 {top_client} 播放了 {clients[top_client]} 次（占比 {round(clients[top_client]/total*100)}%）。",
            severity="info",
        ))

    # 观看时段
    hour_counts = {}
    for s in sessions:
        if s.started_at:
            h = s.started_at.hour
            hour_counts[h] = hour_counts.get(h, 0) + 1
    if hour_counts:
        peak_hour = max(hour_counts, key=hour_counts.get)
        peak_label = f"{peak_hour}:00-{peak_hour+1}:00"
        insights.append(AiInsight(
            panel_user_id=uid, category="watch",
            title=f"⏰ 高峰时段: {peak_label}",
            content=f"用户在 {peak_label} 时段最活跃（{hour_counts[peak_hour]} 次播放）。",
            severity="info",
        ))

    return insights


async def _detect_anomalies(db_session, uid: int, eid: str, config: dict, now: datetime) -> list[AiInsight]:
    """检测异常行为"""
    insights = []
    whitelist_mode = config.get("whitelist_mode", "disabled")
    if whitelist_mode == "skip_anomaly":
        wl = await db_session.execute(
            select(AiWhitelist).where(AiWhitelist.panel_user_id == uid, AiWhitelist.is_active == 1)
        )
        if wl.scalar_one_or_none():
            return insights  # 跳过异常检测

    # 短时间大量播放
    one_day_ago = now - timedelta(days=1)
    result = await db_session.execute(
        select(func.count(SessionHistory.id))
        .where(
            SessionHistory.user_id == eid,
            SessionHistory.started_at >= one_day_ago,
        )
    )
    recent_plays = result.scalar() or 0

    if recent_plays > config["anomaly_threshold"] * 3:
        insights.append(AiInsight(
            panel_user_id=uid, category="anomaly",
            title=f"🚨 24h 内播放 {recent_plays} 次 — 异常活跃",
            content=f"短时间大量播放可能为异常行为。阈值设定 {config['anomaly_threshold']*3} 次，当前 {recent_plays} 次。",
            severity="danger",
            auto_action="suggest_review",
        ))

    # 高转码率异常
    result = await db_session.execute(
        select(func.avg(SessionHistory.transcoding))
        .where(SessionHistory.user_id == eid)
    )
    avg_transcode = result.scalar() or 0
    if avg_transcode > 0.8:
        insights.append(AiInsight(
            panel_user_id=uid, category="anomaly",
            title="🔄 长期高转码率 (>80%)",
            content="该用户几乎所有播放都触发转码，可能客户端不兼容或网络问题。",
            severity="warning",
        ))

    return insights


async def _detect_multi_device(db_session, uid: int, eid: str, config: dict, now: datetime) -> list[AiInsight]:
    """检测多设备 / 多 IP 同时使用"""
    insights = []
    max_sessions = config.get("multi_device_max_sessions", 3)

    # 获取最近24小时的会话（按IP去重）
    one_day_ago = now - timedelta(days=1)
    result = await db_session.execute(
        select(SessionHistory.ip_address, SessionHistory.client, SessionHistory.device)
        .where(
            SessionHistory.user_id == eid,
            SessionHistory.started_at >= one_day_ago,
        )
        .distinct()
    )
    combos = result.all()

    # 去重统计
    unique_ips = set()
    unique_clients = set()
    unique_devices = set()
    for ip, client, device in combos:
        if ip:
            unique_ips.add(ip)
        if client:
            unique_clients.add(client)
        if device:
            unique_devices.add(device)

    if unique_ips:
        ip_count = len(unique_ips)
        if ip_count >= max_sessions:
            insights.append(AiInsight(
                panel_user_id=uid, category="anomaly",
                title=f"🌐 多 IP 使用 ({ip_count} 个 IP)",
                content=f"最近24小时从 {ip_count} 个不同 IP 登录/播放。IP: {', '.join(list(unique_ips)[:5])}",
                severity="warning" if ip_count < max_sessions * 2 else "danger",
                auto_action="suggest_review" if ip_count >= max_sessions * 2 else "",
            ))

    if unique_clients:
        client_count = len(unique_clients)
        if client_count >= 4:
            insights.append(AiInsight(
                panel_user_id=uid, category="anomaly",
                title=f"📱 多客户端 ({client_count} 个不同客户端)",
                content=f"24小时内使用了 {client_count} 种客户端: {', '.join(list(unique_clients)[:6])}",
                severity="warning",
            ))

    return insights


async def _check_client_restrictions(db_session, uid: int, eid: str, config: dict, now: datetime) -> list[AiInsight]:
    """检测用户是否使用了被限制的客户端"""
    insights = []
    blocked = config.get("client_restrictions", "").strip()
    if not blocked:
        return insights

    blocked_list = [c.strip().lower() for c in blocked.split(",") if c.strip()]

    one_day_ago = now - timedelta(days=1)
    result = await db_session.execute(
        select(SessionHistory.client)
        .where(
            SessionHistory.user_id == eid,
            SessionHistory.started_at >= one_day_ago,
        )
        .distinct()
    )
    used_clients = {c[0].lower() if c[0] else "" for c in result.all()}

    violations = []
    for bc in blocked_list:
        for uc in used_clients:
            if bc in uc or uc in bc:
                violations.append(bc)

    if violations:
        insights.append(AiInsight(
            panel_user_id=uid, category="anomaly",
            title=f"🚫 使用受限客户端: {', '.join(violations)}",
            content=f"检测到用户使用了受限客户端。已禁用客户端: {blocked}",
            severity="warning",
            auto_action="suggest_upgrade",
        ))

    return insights


async def _generate_recommendations(db_session, uid: int, eid: str, now: datetime) -> list[AiInsight]:
    """生成个性化推荐"""
    insights = []

    result = await db_session.execute(
        select(
            func.count(SessionHistory.id),
            func.sum(SessionHistory.duration_seconds),
        ).where(SessionHistory.user_id == eid)
    )
    total_plays, total_duration = result.one()
    total_plays = total_plays or 0
    total_duration = total_duration or 0

    if total_plays > 0:
        hours = total_duration // 3600
        insights.append(AiInsight(
            panel_user_id=uid, category="recommendation",
            title=f"🏆 累计播放 {total_plays} 次，{hours} 小时",
            content=f"在 Emby 上累计观看了 {total_plays} 个内容，共计 {hours} 小时。继续保持！",
            severity="info",
        ))

    result = await db_session.execute(
        select(func.count())
        .where(UserActivity.user_id == eid, UserActivity.date >= (now - timedelta(days=7)).strftime("%Y-%m-%d"))
    )
    active_days_7 = result.scalar() or 0

    if active_days_7 == 0:
        insights.append(AiInsight(
            panel_user_id=uid, category="recommendation",
            title="💡 最近7天没有播放记录",
            content="来看看 Emby 上有什么新内容吧！访问「影视发现」页探索热门影片。",
            severity="info",
        ))

    return insights


# ── LLM 增强分析 🤖 ────────────────────────────────────────────────


async def _enrich_with_llm(db_session, uid: int, eid: str, uname: str, config: dict, now: datetime) -> list[AiInsight]:
    """使用配置的 LLM 增强分析结果。"""
    insights = []

    try:
        # 收集用户数据
        last_activity = await db_session.execute(
            select(UserActivity).where(UserActivity.user_id == eid).order_by(UserActivity.date.desc()).limit(1)
        )
        last = last_activity.scalar_one_or_none()
        last_active = last.date if last else "无记录"

        # 30天数据
        thirty_days_ago = (now - timedelta(days=30)).strftime("%Y-%m-%d")
        result = await db_session.execute(
            select(
                func.sum(UserActivity.play_count),
                func.sum(UserActivity.duration_seconds),
                func.sum(UserActivity.unique_items),
                func.count(UserActivity.id),
            ).where(UserActivity.user_id == eid, UserActivity.date >= thirty_days_ago)
        )
        stats = result.one()
        plays_30d = stats[0] or 0
        duration_30d = stats[1] or 0
        items_30d = stats[2] or 0
        active_days_30d = stats[3] or 0

        # 累计数据
        result = await db_session.execute(
            select(func.count(SessionHistory.id), func.sum(SessionHistory.duration_seconds))
            .where(SessionHistory.user_id == eid)
        )
        total_plays, total_duration = result.one()
        total_plays = total_plays or 0
        total_duration = total_duration or 0

        # 客户端分析
        sessions_result = await db_session.execute(
            select(SessionHistory).where(SessionHistory.user_id == eid).order_by(SessionHistory.started_at.desc()).limit(50)
        )
        sessions = sessions_result.scalars().all()
        clients = {}
        for s in sessions:
            c = s.client or "Unknown"
            clients[c] = clients.get(c, 0) + 1
        top_client = max(clients, key=clients.get) if clients else "Unknown"

        total_sessions = len(sessions)
        transcoded = sum(1 for s in sessions if s.transcoding)
        transcode_rate = round(transcoded / total_sessions * 100) if total_sessions > 0 else 0

        # 高峰时段
        hour_counts = {}
        for s in sessions:
            if s.started_at:
                h = s.started_at.hour
                hour_counts[h] = hour_counts.get(h, 0) + 1
        peak_hour = f"{max(hour_counts, key=hour_counts.get)}:00" if hour_counts else "未知"

        # 最近7天
        result = await db_session.execute(
            select(func.count()).where(
                UserActivity.user_id == eid,
                UserActivity.date >= (now - timedelta(days=7)).strftime("%Y-%m-%d")
            )
        )
        active_days_7 = result.scalar() or 0

        # 24h活跃
        one_day_ago = now - timedelta(days=1)
        result = await db_session.execute(
            select(func.count(SessionHistory.id))
            .where(SessionHistory.user_id == eid, SessionHistory.started_at >= one_day_ago)
        )
        recent_24h_plays = result.scalar() or 0

        # 去重IP
        result = await db_session.execute(
            select(SessionHistory.ip_address)
            .where(SessionHistory.user_id == eid, SessionHistory.started_at >= one_day_ago)
            .distinct()
        )
        unique_ips = len([r for r in result.all() if r[0]])

        user_data = {
            "username": uname,
            "total_plays": total_plays,
            "total_hours": total_duration // 3600,
            "last_active": str(last_active),
            "plays_30d": plays_30d,
            "hours_30d": duration_30d // 3600,
            "items_30d": items_30d,
            "active_days_30d": active_days_30d,
            "top_client": top_client,
            "transcode_rate": transcode_rate,
            "peak_hour": peak_hour,
            "active_days_7": active_days_7,
            "recent_24h_plays": recent_24h_plays,
            "unique_ips": unique_ips,
        }

        llm_result = await generate_user_analysis(config, user_data)
        if not llm_result:
            return insights

        tags = llm_result.get("tags", [])

        # Activity insight
        if llm_result.get("activity_title"):
            insights.append(AiInsight(
                panel_user_id=uid, category="activity",
                title=llm_result["activity_title"],
                content=llm_result.get("activity_content", ""),
                severity=llm_result.get("activity_severity", "info"),
            ))

        # Watch pattern insight
        if llm_result.get("watch_title"):
            insights.append(AiInsight(
                panel_user_id=uid, category="watch",
                title=llm_result["watch_title"],
                content=llm_result.get("watch_content", ""),
                severity=llm_result.get("watch_severity", "info"),
            ))

        # Anomaly insight
        if llm_result.get("anomaly_title"):
            insights.append(AiInsight(
                panel_user_id=uid, category="anomaly",
                title=llm_result["anomaly_title"],
                content=llm_result.get("anomaly_content", ""),
                severity=llm_result.get("anomaly_severity", "info"),
            ))

        # Recommendation insight
        if llm_result.get("recommendation_title"):
            content = llm_result.get("recommendation_content", "")
            if tags:
                content += f"\n🏷️ 标签: {' '.join(tags)}"
            insights.append(AiInsight(
                panel_user_id=uid, category="recommendation",
                title=llm_result["recommendation_title"],
                content=content,
                severity="info",
            ))

        logger.info(f"LLM enrichment for {uname}: {len(insights)} insights, tags={tags}")

    except Exception as e:
        logger.warning(f"LLM enrichment failed for {uname}: {e}")

    return insights


# ── 自动执行 ⚡ ──────────────────────────────────────────────────────


async def _enforce_auto_disable(db_session, config: dict, emby=None) -> int:
    """自动禁用超过阈值的用户。返回已禁用的用户数。"""
    actions = 0
    disable_days = config["auto_disable_days"]

    # 查找所有 severity=danger 且 auto_action=suggest_disable 的洞察
    result = await db_session.execute(
        select(AiInsight).where(
            AiInsight.severity == "danger",
            AiInsight.auto_action == "suggest_disable",
        )
    )
    danger_insights = result.scalars().all()

    processed_user_ids = set()
    for ins in danger_insights:
        if ins.panel_user_id in processed_user_ids:
            continue
        processed_user_ids.add(ins.panel_user_id)

        # 获取 PanelUser
        user_result = await db_session.execute(
            select(PanelUser).where(PanelUser.id == ins.panel_user_id)
        )
        user = user_result.scalar_one_or_none()
        if not user or not user.is_active:
            continue

        # 禁用 PanelUser
        user.is_active = 0
        db_session.add(user)

        # 同时尝试禁用 Emby 用户
        if emby and user.emby_user_id:
            try:
                policy = {"IsDisabled": True, "IsAdministrator": False, "IsHidden": False}
                await emby.update_user_policy(user.emby_user_id, policy)
                logger.info(f"Auto-disabled Emby user {user.emby_user_id} ({user.emby_username})")
            except Exception as e:
                logger.warning(f"Failed to disable Emby user {user.emby_user_id}: {e}")

        actions += 1

    if actions:
        await db_session.commit()
        logger.info(f"Auto-disabled {actions} users")

    return actions


async def _send_tg_alerts(db_session, config: dict) -> int:
    """发送 TG 推送通知 (danger + warning 洞察)。返回发送数。"""
    from .tg_bot import send_message

    admin_chat_id = config.get("tg_admin_chat_id", "").strip()
    if not admin_chat_id:
        return 0

    # 获取所有 danger/warning 级别的洞察
    result = await db_session.execute(
        select(AiInsight).where(
            AiInsight.severity.in_(["danger", "warning"])
        ).order_by(AiInsight.severity.desc(), AiInsight.created_at.desc())
    )
    alerts = result.scalars().all()

    if not alerts:
        return 0

    # 按用户分组
    user_alerts: dict[int, list[AiInsight]] = {}
    for a in alerts:
        if a.panel_user_id not in user_alerts:
            user_alerts[a.panel_user_id] = []
        user_alerts[a.panel_user_id].append(a)

    sent = 0
    # 管理员总览 (最多5个用户)
    overview_lines = ["🤖 <b>AI 管控 - 异常告警</b>\n"]
    count = 0
    for uid, user_insights in user_alerts.items():
        if count >= 5:
            remaining = len(user_alerts) - count
            overview_lines.append(f"...还有 {remaining} 个用户未列出")
            break
        u = (await db_session.execute(select(PanelUser.username).where(PanelUser.id == uid))).scalar_one_or_none() or f"#{uid}"
        overview_lines.append(f"\n👤 <b>{u}</b> ({len(user_insights)} 条):")
        for ins in user_insights[:3]:  # 每个用户最多3条
            icon = "🚨" if ins.severity == "danger" else "⚡"
            overview_lines.append(f"  {icon} {ins.title}")
        count += 1

    # 推送给管理员
    await send_message(admin_chat_id, "\n".join(overview_lines))
    sent += 1

    # 同时推送给对应绑定的用户 (只发他们自己的 danger 警告)
    for uid, user_insights in user_alerts.items():
        danger_items = [i for i in user_insights if i.severity == "danger"]
        if not danger_items:
            continue
        # 用 send_notify_to_user
        from .tg_bot import send_notify_to_user
        for ins in danger_items[:2]:  # 每人最多2条
            ok = await send_notify_to_user(uid, f"⚠️ {ins.title}", ins.content)
            if ok:
                sent += 1

    return sent
