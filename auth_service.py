"""
auth_service.py
───────────────
JWT-based authentication helper.
Creates and verifies access tokens for the Aesthetico Dashboard.
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt

# ── Config ────────────────────────────────────────────────────────────────────

# Secret key for signing tokens. Reads from env or uses a random default.
# In production, always set AUTH_SECRET_KEY in .env
SECRET_KEY = os.getenv("AUTH_SECRET_KEY", "aesthetico-dashboard-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24  # Token valid for 24 hours


# ── Token Functions ───────────────────────────────────────────────────────────

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Create a JWT access token.

    Args:
        data: Payload dict (should include 'username', 'email', 'role').
        expires_delta: Custom expiration time. Defaults to ACCESS_TOKEN_EXPIRE_HOURS.

    Returns:
        Encoded JWT string.
    """
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)

    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def verify_access_token(token: str) -> Optional[dict]:
    """
    Verify and decode a JWT access token.

    Args:
        token: The JWT string.

    Returns:
        Decoded payload dict on success, None on failure.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        # Ensure required fields are present
        if not payload.get("email") or not payload.get("role"):
            return None
        return payload
    except JWTError:
        return None
