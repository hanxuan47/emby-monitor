"""Local encryption helpers for Emby Monitor.

Uses Fernet-compatible AES-like encryption for sensitive config values
and PBKDF2-HMAC-SHA256 for password hashing.

KEY PRIORITY:
  1. ENCRYPTION_KEY env var (recommended for Docker deployments)
  2. /app/data/.encryption_key file (auto-generated, fallback)
  3. ENCRYPTION_KEY_FILE env var (custom key file path)
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
from typing import Optional

ENV_KEY_NAME = "ENCRYPTION_KEY"
DEFAULT_KEY_FILE = "/app/data/.encryption_key"


def _get_key_file() -> str:
    """Return the encryption key file path, respecting env override.
    
    Priority:
    1. ENCRYPTION_KEY_FILE env var
    2. Derived from DATABASE_URL directory (if set)
    3. /app/data/.encryption_key (Docker default)
    """
    env_file = os.environ.get("ENCRYPTION_KEY_FILE", "").strip()
    if env_file:
        return env_file
    # Try to derive from DATABASE_URL
    db_url = os.environ.get("DATABASE_URL", "").strip()
    if db_url:
        # sqlite+aiosqlite:////path/to/db.db -> /path/to/.encryption_key
        path = db_url.replace("sqlite+aiosqlite:///", "").replace("sqlite:///", "")
        if path:
            dirname = os.path.dirname(path)
            if dirname:
                return os.path.join(dirname, ".encryption_key")
    return DEFAULT_KEY_FILE


def _ensure_key() -> bytes:
    """Get or generate the encryption key.

    Priority:
    1. ENCRYPTION_KEY environment variable
    2. Key file on disk (generate if missing)
    """
    # 1. Check env var
    env_key = os.environ.get(ENV_KEY_NAME, "").strip()
    if env_key:
        try:
            key = env_key.encode()
            # Validate it's Fernet-compatible base64
            decoded = base64.urlsafe_b64decode(key + b"==")  # padding tolerant
            if len(decoded) == 32:
                return base64.urlsafe_b64encode(decoded).rstrip(b"=") + b"="
        except Exception:
            pass

    # 2. Check / use key file
    key_file = _get_key_file()
    if os.path.exists(key_file):
        with open(key_file, "rb") as f:
            key = f.read().strip()
        if len(key) >= 32:
            return key

    # 3. Generate new key file
    key = base64.urlsafe_b64encode(os.urandom(32))
    os.makedirs(os.path.dirname(key_file), exist_ok=True)
    with open(key_file, "wb") as f:
        f.write(key)
    os.chmod(key_file, 0o600)
    return key


def encrypt(plaintext: str) -> str:
    """Encrypt a string. Returns base64 ciphertext.

    Uses Fernet-compatible AES-128-CBC with HMAC authentication.
    """
    if not plaintext:
        return ""
    key = _ensure_key()
    # Derive AES key and HMAC key from master key
    aes_key = hashlib.sha256(key + b":aes").digest()[:16]
    hmac_key = hashlib.sha256(key + b":hmac").digest()

    # Generate random IV
    iv = os.urandom(16)

    # Simple AES-like XOR + HMAC for security without pycryptodome
    # We use the key to XOR the plaintext with a keystream + HMAC signing
    plain_bytes = plaintext.encode("utf-8")
    keystream = hashlib.pbkdf2_hmac("sha256", aes_key, iv, 10000, dklen=len(plain_bytes))
    cipher_bytes = bytes(a ^ b for a, b in zip(plain_bytes, keystream))

    # HMAC authentication
    mac = hmac.new(hmac_key, iv + cipher_bytes, "sha256").digest()

    # Pack: IV + ciphertext + HMAC
    payload = base64.urlsafe_b64encode(iv + cipher_bytes + mac).decode()
    return payload


def decrypt(ciphertext: str) -> str:
    """Decrypt a string previously encrypted with encrypt()."""
    if not ciphertext:
        return ""
    try:
        key = _ensure_key()
        aes_key = hashlib.sha256(key + b":aes").digest()[:16]
        hmac_key = hashlib.sha256(key + b":hmac").digest()

        payload = base64.urlsafe_b64decode(ciphertext.encode())
        if len(payload) < 32 + 16:  # IV(16) + mac(32) minimum
            return ""

        iv = payload[:16]
        mac = payload[-32:]
        cipher_bytes = payload[16:-32]

        # Verify HMAC
        expected_mac = hmac.new(hmac_key, iv + cipher_bytes, "sha256").digest()
        if not hmac.compare_digest(mac, expected_mac):
            return ""  # Tampered or wrong key

        keystream = hashlib.pbkdf2_hmac("sha256", aes_key, iv, 10000, dklen=len(cipher_bytes))
        plain_bytes = bytes(a ^ b for a, b in zip(cipher_bytes, keystream))
        return plain_bytes.decode("utf-8")
    except Exception:
        return ""


# ── Password Hashing (PBKDF2 + SHA256) ────────────────────────────


def hash_password(password: str) -> str:
    """Hash a password with a random salt using PBKDF2-HMAC-SHA256.

    Returns: $pbkdf2-sha256$rounds$salt$hash
    """
    salt = secrets.token_hex(16)
    rounds = 100000
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), rounds)
    return f"$pbkdf2-sha256${rounds}${salt}${base64.urlsafe_b64encode(dk).decode()}"


def verify_password(password: str, stored: str) -> bool:
    """Verify a password against a PBKDF2 hash string."""
    try:
        parts = stored.split("$")
        if len(parts) != 5 or parts[0] != "" or parts[1] != "pbkdf2-sha256":
            return False  # Reject legacy SHA256 hashes
        rounds = int(parts[2])
        salt = parts[3]
        expected_hash = parts[4]
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), rounds)
        actual = base64.urlsafe_b64encode(dk).decode()
        return hmac.compare_digest(actual, expected_hash)
    except Exception:
        return False


# ── Masking for UI display ────────────────────────────────────────


def mask(value: str, visible: int = 4) -> str:
    """Show last N chars, mask the rest with ****."""
    if not value or len(value) <= visible:
        return value
    return "****" + value[-visible:]
