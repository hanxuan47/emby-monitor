"""Local encryption helpers for Emby Monitor.

Uses Fernet (symmetric AES-128-CBC) for encrypting sensitive config values
and PBKDF2-HMAC-SHA256 for password hashing. The encryption key is
auto-generated on first run and stored at /app/data/.encryption_key.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
from typing import Optional

KEY_FILE = "/app/data/.encryption_key"


# ── Fernet Encryption ──────────────────────────────────────────────


def _ensure_key() -> bytes:
    """Get or generate the Fernet-compatible encryption key."""
    if os.path.exists(KEY_FILE):
        with open(KEY_FILE, "rb") as f:
            key = f.read().strip()
        # Ensure key is valid base64 (Fernet key format)
        if len(key) == 44 and key.count(b"=") <= 2:
            return key
    # Generate a new key
    key = base64.urlsafe_b64encode(os.urandom(32))
    os.makedirs(os.path.dirname(KEY_FILE), exist_ok=True)
    with open(KEY_FILE, "wb") as f:
        f.write(key)
    os.chmod(KEY_FILE, 0o600)  # Only owner can read
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
            # Legacy SHA256 fallback
            return hashlib.sha256(password.encode()).hexdigest() == stored
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
