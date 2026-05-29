"""Emby API Client — async HTTP wrapper for Emby Server API."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any

import httpx

logger = logging.getLogger(__name__)


class EmbyClient:
    """Async client for Emby Server REST API."""

    def __init__(self, host: str, api_key: str):
        self.base_url = host.rstrip("/")
        self.api_key = api_key
        self._client: httpx.AsyncClient | None = None
        self.server_name: str = ""
        self.server_version: str = ""

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                params={"api_key": self.api_key},
                timeout=httpx.Timeout(15.0),
                headers={"Accept": "application/json"},
            )
        return self._client

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        client = await self._get_client()
        resp = await client.get(path, params=params or {})
        resp.raise_for_status()
        return resp.json()

    async def _post(
        self, path: str, json_body: dict[str, Any] | None = None, params: dict[str, Any] | None = None
    ) -> Any:
        client = await self._get_client()
        resp = await client.post(path, json=json_body, params=params or {})
        resp.raise_for_status()
        if resp.text:
            return resp.json()
        return {}

    async def _delete(self, path: str, params: dict[str, Any] | None = None) -> None:
        client = await self._get_client()
        resp = await client.delete(path, params=params or {})
        resp.raise_for_status()

    # ── System ──────────────────────────────────────────────────────

    async def get_system_info(self) -> dict[str, Any]:
        info = await self._get("/emby/System/Info")
        self.server_name = info.get("ServerName", "")
        self.server_version = info.get("Version", "")
        return info

    async def health(self) -> bool:
        try:
            await self.get_system_info()
            return True
        except Exception:
            return False

    # ── Sessions (active streams) ───────────────────────────────────

    async def get_sessions(self) -> list[dict[str, Any]]:
        """Return all active sessions with playback info."""
        return await self._get(
            "/emby/Sessions",
            params={"ControllableByUserId": "any", "Fields": "UserId"},
        )

    async def get_active_streams(self) -> list[dict[str, Any]]:
        """Return sessions that are actively playing something."""
        sessions = await self.get_sessions()
        return [s for s in sessions if s.get("NowPlayingItem") is not None]

    # ── Users ───────────────────────────────────────────────────────

    async def get_users(self) -> list[dict[str, Any]]:
        return await self._get("/emby/Users")

    async def get_user(self, user_id: str) -> dict[str, Any]:
        return await self._get(f"/emby/Users/{user_id}")

    async def get_users_with_policy(self) -> list[dict[str, Any]]:
        """Return all users including their policy settings."""
        users = await self.get_users()
        enriched = []
        for u in users:
            uid = u.get("Id", "")
            policy = u.get("Policy", {})
            enriched.append({
                "id": uid,
                "name": u.get("Name", ""),
                "serverId": u.get("ServerId", ""),
                "isAdministrator": u.get("Policy", {}).get("IsAdministrator", False),
                "isDisabled": u.get("Policy", {}).get("IsDisabled", False),
                "isHidden": u.get("Policy", {}).get("IsHidden", False),
                "lastLoginDate": u.get("LastLoginDate", ""),
                "lastActivityDate": u.get("LastActivityDate", ""),
                "hasPassword": bool(u.get("HasPassword", False)),
                "maxActiveSessions": policy.get("EnableUserPreferenceAccess", True),
                "enableAllChannels": policy.get("EnableAllChannels", False),
                "enableAllFolders": policy.get("EnableAllFolders", True),
                "enableAllDevices": policy.get("EnableAllDevices", True),
                "blockedTags": policy.get("BlockedTags", []),
                "enabledFolders": policy.get("EnabledFolders", []),
                "maxActiveSessions": policy.get("MaxActiveSessions", 0),
                "playbackMbps": policy.get("RemoteClientBitrateLimit", 0),
            })
        return enriched

    async def create_user(self, name: str) -> dict[str, Any]:
        """Create a new Emby user."""
        return await self._post("/emby/Users/New", json_body={"Name": name})

    async def delete_user(self, user_id: str) -> None:
        """Delete an Emby user."""
        await self._delete(f"/emby/Users/{user_id}")

    async def update_user_password(
        self, user_id: str, current_password: str = "", new_password: str = ""
    ) -> None:
        """Set or reset a user's password. Empty new_password clears it."""
        await self._post(
            f"/emby/Users/{user_id}/Password",
            json_body={
                "CurrentPw": current_password,
                "NewPw": new_password,
            },
        )

    async def update_user_policy(self, user_id: str, policy: dict[str, Any]) -> None:
        """Update a user's policy (permissions, restrictions)."""
        await self._post(
            f"/emby/Users/{user_id}/Policy",
            json_body=policy,
        )

    async def authenticate_user(self, username: str, password: str) -> dict[str, Any]:
        """Authenticate a user and return session info."""
        client = await self._get_client()
        resp = await client.post(
            "/emby/Users/AuthenticateByName",
            json={"Username": username, "Pw": password},
        )
        resp.raise_for_status()
        return resp.json()

    # ── Library (Items) ─────────────────────────────────────────────

    async def get_items(
        self,
        parent_id: str | None = None,
        recursive: bool = True,
        include_item_types: str | None = "Movie,Series,Episode,MusicArtist,MusicAlbum,Audio",
        fields: str = "MediaSources,MediaStreams",
        limit: int = 500,
        sort_by: str = "SortName",
        sort_order: str = "Ascending",
    ) -> dict[str, Any]:
        params: dict[str, Any] = {
            "Recursive": str(recursive).lower(),
            "Fields": fields,
            "Limit": limit,
            "SortBy": sort_by,
            "SortOrder": sort_order,
        }
        if parent_id:
            params["ParentId"] = parent_id
        if include_item_types:
            params["IncludeItemTypes"] = include_item_types
        return await self._get("/emby/Items", params=params)

    async def get_views(self) -> list[dict[str, Any]]:
        data = await self._get("/emby/Users/Public/Items", params={"format": "json"})
        items = data if isinstance(data, list) else data.get("Items", [])
        return [i for i in items if i.get("CollectionType") in ("movies", "tvshows", "music")]

    async def get_library_stats(self) -> dict[str, Any]:
        """Compute aggregate library statistics."""
        movies = await self._get_items_by_type("Movie")
        series = await self._get_items_by_type("Series")
        episodes = await self._get_items_by_type("Episode")
        music = await self._get_items_by_type("Audio")

        def total_size(items: list) -> int:
            return sum(
                sum(s.get("Size", 0) for s in i.get("MediaSources", []) or [])
                for i in items if i.get("MediaSources")
            )

        return {
            "movies": {"count": len(movies), "size_bytes": total_size(movies)},
            "series": {"count": len(series), "size_bytes": total_size(series)},
            "episodes": {"count": len(episodes), "size_bytes": total_size(episodes)},
            "tracks": {"count": len(music), "size_bytes": total_size(music)},
            "total_items": len(movies) + len(series) + len(episodes) + len(music),
            "total_size_bytes": total_size(movies) + total_size(series) + total_size(episodes) + total_size(music),
        }

    async def _get_items_by_type(self, item_type: str) -> list[dict[str, Any]]:
        data = await self._get(
            "/emby/Items",
            params={
                "Recursive": "true",
                "IncludeItemTypes": item_type,
                "Fields": "MediaSources,MediaStreams",
                "Limit": 500,
                "SortBy": "SortName",
            },
        )
        items = data if isinstance(data, list) else data.get("Items", [])
        return items

    async def get_recently_added(self, limit: int = 20) -> list[dict[str, Any]]:
        data = await self._get(
            "/emby/Items",
            params={
                "Recursive": "true",
                "Fields": "Overview,Genres",
                "Limit": limit,
                "SortBy": "DateCreated",
                "SortOrder": "Descending",
            },
        )
        items = data if isinstance(data, list) else data.get("Items", [])
        return items

    async def get_play_count(self, user_id: str, item_id: str) -> int:
        """Get the play count for a specific user+item combo."""
        try:
            data = await self._get(
                f"/emby/Users/{user_id}/Items/{item_id}",
                params={"Fields": "PlayCount"},
            )
            return data.get("PlayCount", 0)
        except Exception:
            return 0

    # ── Activity Log ────────────────────────────────────────────────

    async def get_activity_log(self, limit: int = 50) -> list[dict[str, Any]]:
        data = await self._get(
            "/emby/System/ActivityLog/Entries",
            params={"Limit": limit},
        )
        if isinstance(data, list):
            return data
        return data.get("Items", [])

    # ── Playback Info ───────────────────────────────────────────────

    async def get_playback_info(self, user_id: str) -> list[dict[str, Any]]:
        """Get a user's playback reporting data."""
        try:
            return await self._get(f"/emby/Users/{user_id}/PlaybackInfo")
        except Exception:
            return []

    async def close(self):
        if self._client:
            await self._client.aclose()
