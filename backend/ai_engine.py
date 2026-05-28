"""
AI 智能分析引擎 — 规则驱动的用户行为分析与自动管控。
分析用户活跃度、观看模式、异常行为，生成洞察报告。
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

from sqlalchemy import func, select

from .models import (
    AiInsight,
    PanelConfig,
    PanelUser,
    SessionHistory,
    UserActivity,
)

logger = logging.getLogger("emby-ai")


async def run_analysis(db_session, emby=None) -> dict:
    """
    执行全量 AI 分析。
    返回分析统计: {users_analyzed, insights_generated, actions_taken}
    """
    config = await _load_config(db_session)
    if not config["enabled"]:
        return {"error": "AI 分析已关闭", "users_analyzed": 0, "insights_generated": 0}

    now = datetime.utcnow()
    users_analyzed = 0
    insights_generated = 0

    # 获取所有活跃用户
    result = await db_session.execute(
        select(PanelUser).where(PanelUser.is_active == 1)
    )
    users = result.scalars().all()

    # 清除旧洞察（保留最新）
    await db_session.execute(AiInsight.__table__.delete())
    await db_session.commit()

    for user in users:
        users_analyzed += 1

        # ── 1. 活跃度分析 ──────────────────────────────────────────
        insights = await _analyze_activity(db_session, user, config, now)
        for ins in insights:
            db_session.add(ins)
            insights_generated += 1

        # ── 2. 观看模式分析 ────────────────────────────────────────
        watch_insights = await _analyze_watch_patterns(db_session, user, now)
        for ins in watch_insights:
            db_session.add(ins)
            insights_generated += 1

        # ── 3. 异常行为检测 ────────────────────────────────────────
        anomaly_insights = await _detect_anomalies(db_session, user, config, now)
        for ins in anomaly_insights:
            db_session.add(ins)
            insights_generated += 1

        # ── 4. 个性化推荐 ──────────────────────────────────────────
        rec_insights = await _generate_recommendations(db_session, user, now)
        for ins in rec_insights:
            db_session.add(ins)
            insights_generated += 1

    await db_session.commit()
    logger.info(f"AI analysis: {users_analyzed} users, {insights_generated} insights")

    return {
        "ok": True,
        "users_analyzed": users_analyzed,
        "insights_generated": insights_generated,
        "timestamp": now.isoformat(),
    }


async def analyze_single_user(db_session, user: PanelUser) -> list[AiInsight]:
    """Run analysis for a single user."""
    config = await _load_config(db_session)
    all_insights = []
    now = datetime.utcnow()

    # Clear old insights for this user
    result = await db_session.execute(
        AiInsight.__table__.delete().where(AiInsight.panel_user_id == user.id)
    )

    for analyzer in [_analyze_activity, _analyze_watch_patterns, _detect_anomalies, _generate_recommendations]:
        insights = await analyzer(db_session, user, config, now)
        for ins in insights:
            db_session.add(ins)
            all_insights.append(ins)

    await db_session.commit()
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
    }


# ── 分析器 ──────────────────────────────────────────────────────


async def _analyze_activity(db_session, user: PanelUser, config: dict, now: datetime) -> list[AiInsight]:
    """分析用户活跃度"""
    insights = []

    # 最近活动
    last_activity = await db_session.execute(
        select(UserActivity)
        .where(UserActivity.panel_user_id == user.id)
        .order_by(UserActivity.date.desc())
        .limit(1)
    )
    last = last_activity.scalar_one_or_none()

    if not last:
        insights.append(AiInsight(
            panel_user_id=user.id, category="activity",
            title="🆕 新用户 - 暂无活动记录",
            content="该用户注册后尚未有任何播放记录，建议引导使用。",
            severity="info",
        ))
        return insights

    last_date = datetime.strptime(last.date, "%Y-%m-%d")
    days_since = (now - last_date).days

    # 30天统计数据
    thirty_days_ago = (now - timedelta(days=30)).strftime("%Y-%m-%d")
    result = await db_session.execute(
        select(
            func.sum(UserActivity.play_count),
            func.sum(UserActivity.duration_seconds),
            func.sum(UserActivity.unique_items),
            func.count(UserActivity.id),
        ).where(
            UserActivity.panel_user_id == user.id,
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
        insights.append(AiInsight(
            panel_user_id=user.id, category="activity",
            title=f"⏳ 用户 {days_since} 天未活动",
            content=f"最后活动: {last.date}。30天内播放 {plays_30d} 次，观看 {duration_30d//3600} 小时，{items_30d} 个不同内容，活跃 {active_days_30d} 天。",
            severity=severity,
            auto_action="suggest_disable" if days_since >= config["auto_disable_days"] else "",
        ))
    else:
        hours = duration_30d // 3600
        daily_avg = round(plays_30d / max(active_days_30d, 1), 1)
        insights.append(AiInsight(
            panel_user_id=user.id, category="activity",
            title=f"📊 月度活跃报告",
            content=f"过去30天播放 {plays_30d} 次（日均 {daily_avg}），观看 {hours} 小时，{items_30d} 个不同内容，活跃 {active_days_30d} 天。",
            severity="info",
        ))

    return insights


async def _analyze_watch_patterns(db_session, user: PanelUser, now: datetime) -> list[AiInsight]:
    """分析观看模式"""
    insights = []

    # 查询最近的会话记录
    result = await db_session.execute(
        select(SessionHistory)
        .where(SessionHistory.panel_user_id == user.id)
        .order_by(SessionHistory.started_at.desc())
        .limit(50)
    )
    sessions = result.scalars().all()

    if not sessions:
        return insights

    # 转码率
    total = len(sessions)
    transcoded = sum(1 for s in sessions if s.transcoding)
    transcode_rate = round(transcoded / total * 100) if total > 0 else 0

    if transcode_rate > 50:
        insights.append(AiInsight(
            panel_user_id=user.id, category="watch",
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
            panel_user_id=user.id, category="watch",
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
            panel_user_id=user.id, category="watch",
            title=f"⏰ 高峰时段: {peak_label}",
            content=f"用户在 {peak_label} 时段最活跃（{hour_counts[peak_hour]} 次播放）。",
            severity="info",
        ))

    return insights


async def _detect_anomalies(db_session, user: PanelUser, config: dict, now: datetime) -> list[AiInsight]:
    """检测异常行为"""
    insights = []

    # 短时间大量播放（可能滥用）
    one_day_ago = now - timedelta(days=1)
    result = await db_session.execute(
        select(func.count(SessionHistory.id))
        .where(
            SessionHistory.panel_user_id == user.id,
            SessionHistory.started_at >= one_day_ago,
        )
    )
    recent_plays = result.scalar() or 0

    if recent_plays > config["anomaly_threshold"] * 3:
        insights.append(AiInsight(
            panel_user_id=user.id, category="anomaly",
            title=f"🚨 24h 内播放 {recent_plays} 次 — 异常活跃",
            content=f"短时间大量播放可能为异常行为。阈值设定 {config['anomaly_threshold']*3} 次，当前 {recent_plays} 次。",
            severity="danger",
            auto_action="suggest_review",
        ))

    # 高转码率异常
    result = await db_session.execute(
        select(func.avg(SessionHistory.transcoding))
        .where(SessionHistory.panel_user_id == user.id)
    )
    avg_transcode = result.scalar() or 0
    if avg_transcode > 0.8:
        insights.append(AiInsight(
            panel_user_id=user.id, category="anomaly",
            title="🔄 长期高转码率 (>80%)",
            content="该用户几乎所有播放都触发转码，可能客户端不兼容或网络问题。",
            severity="warning",
        ))

    return insights


async def _generate_recommendations(db_session, user: PanelUser, now: datetime) -> list[AiInsight]:
    """生成个性化推荐"""
    insights = []

    # 基于观看历史统计
    result = await db_session.execute(
        select(
            func.count(SessionHistory.id),
            func.sum(SessionHistory.duration_seconds),
        ).where(SessionHistory.panel_user_id == user.id)
    )
    total_plays, total_duration = result.one()
    total_plays = total_plays or 0
    total_duration = total_duration or 0

    if total_plays > 0:
        hours = total_duration // 3600
        insights.append(AiInsight(
            panel_user_id=user.id, category="recommendation",
            title=f"🏆 累计播放 {total_plays} 次，{hours} 小时",
            content=f"在 Emby 上累计观看了 {total_plays} 个内容，共计 {hours} 小时。继续保持！",
            severity="info",
        ))

    # 签到推荐
    result = await db_session.execute(
        select(func.count())
        .where(UserActivity.panel_user_id == user.id, UserActivity.date >= (now - timedelta(days=7)).strftime("%Y-%m-%d"))
    )
    active_days_7 = result.scalar() or 0

    if active_days_7 == 0:
        insights.append(AiInsight(
            panel_user_id=user.id, category="recommendation",
            title="💡 最近7天没有播放记录",
            content="来看看 Emby 上有什么新内容吧！访问「影视发现」页探索热门影片。",
            severity="info",
        ))

    return insights
