"""
LLM 客户端 — 适配 OpenAI 兼容接口的 AI 分析引擎。
内置 provider 预设：openai / deepseek / moonshot（xiaomi）
"""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx

logger = logging.getLogger("emby-llm")

# ── 内置 Provider 预设 ─────────────────────────────────────────────

PROVIDER_PRESETS: dict[str, dict[str, str]] = {
    "openai": {
        "label": "OpenAI (GPT)",
        "api_url": "https://api.openai.com/v1",
        "models": "gpt-4o,gpt-4o-mini,gpt-4-turbo,gpt-3.5-turbo",
    },
    "deepseek": {
        "label": "DeepSeek",
        "api_url": "https://api.deepseek.com/v1",
        "models": "deepseek-chat,deepseek-reasoner",
    },
    "moonshot": {
        "label": "Moonshot (月之暗面)",
        "api_url": "https://api.moonshot.cn/v1",
        "models": "moonshot-v1-8k,moonshot-v1-32k,moonshot-v1-128k",
    },
}

# ── 分析 Prompt ────────────────────────────────────────────────────

ANALYSIS_PROMPT = """你是一个 Emby 媒体服务器用户行为分析专家。
根据以下用户数据，生成一份全面的用户行为分析报告。

数据：
- 用户名: {username}
- 累计播放: {total_plays} 次, 累计观看 {total_hours} 小时
- 最后活跃: {last_active}
- 30天播放: {plays_30d} 次, 观看 {hours_30d} 小时, {items_30d} 个内容
- 活跃天数: {active_days_30d} 天
- 常用客户端: {top_client}
- 转码率: {transcode_rate}%
- 高峰时段: {peak_hour}
- 最近7天活跃: {active_days_7} 天
- 24h播放数: {recent_24h_plays}
- 最近IP数: {unique_ips} 个

请输出 JSON 格式，不要包含 markdown 代码块标记：
{{
  "activity_title": "简短中文标题（带emoji，不超过20字）",
  "activity_content": "用户活跃度分析（50-100字中文）",
  "activity_severity": "info/warning/danger",
  "watch_title": "观看模式标题（带emoji，不超过20字）",
  "watch_content": "用户观看行为分析（50-100字中文）",
  "anomaly_title": "异常检测标题，没有异常则空字符串",
  "anomaly_content": "异常检测分析，没有异常则空字符串",
  "anomaly_severity": "info/warning/danger",
  "recommendation_title": "个性化推荐标题（带emoji）",
  "recommendation_content": "个性化建议（50-100字中文）",
  "tags": ["标签1", "标签2", "标签3"]
}}

注意：
1. 如果 anomaly_title 为空，则跳过异常洞察
2. severity 根据实际情况判断
3. 使用中文，语气友好但有专业判断
4. 标签建议: 活跃用户/潜水用户/重度用户/异常用户/新用户/深夜党/客户端党等"""


async def chat_completion(
    config: dict[str, Any],
    system_prompt: str,
    user_prompt: str,
    temperature: float = 0.7,
    max_tokens: int = 1024,
) -> str | None:
    """Call LLM chat completion via OpenAI-compatible API."""
    provider = config.get("llm_provider", "custom")
    api_key = config.get("llm_api_key", "").strip()
    api_url = config.get("llm_api_url", "").strip().rstrip("/")
    model = config.get("llm_model", "gpt-4o-mini").strip()

    if not api_key or not api_url:
        logger.warning("LLM not configured: missing API key or URL")
        return None

    try:
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

        body = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        async with httpx.AsyncClient(timeout=30) as cl:
            resp = await cl.post(
                f"{api_url}/chat/completions",
                headers=headers,
                json=body,
            )

        if resp.status_code != 200:
            logger.error(f"LLM API error {resp.status_code}: {resp.text[:200]}")
            return None

        data = resp.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        return content

    except Exception as e:
        logger.error(f"LLM call failed: {e}")
        return None


async def generate_user_analysis(
    config: dict[str, Any],
    user_data: dict[str, Any],
) -> dict[str, Any] | None:
    """Generate AI-powered user analysis via LLM.
    Returns enriched insight data or None if LLM not configured / fails.
    """
    if config.get("llm_enabled", "0") != "1":
        return None

    prompt = ANALYSIS_PROMPT.format(**user_data)
    raw = await chat_completion(
        config=config,
        system_prompt="你是一个 Emby 用户行为分析专家。只输出JSON，不要markdown。",
        user_prompt=prompt,
    )

    if not raw:
        return None

    # Clean response (strip markdown code fences if present)
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1]
    if raw.endswith("```"):
        raw = raw.rsplit("```", 1)[0]
    raw = raw.strip()

    try:
        result = json.loads(raw)
        return result
    except json.JSONDecodeError:
        logger.warning(f"LLM returned invalid JSON: {raw[:200]}")
        return None
