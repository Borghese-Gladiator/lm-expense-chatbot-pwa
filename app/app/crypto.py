from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet
from pydantic import SecretStr


def _fernet(secret: SecretStr) -> Fernet:
    raw = secret.get_secret_value()
    if len(raw) < 16:
        raise RuntimeError("APP_SECRET_KEY must be set (16+ characters) to store bank tokens")
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(raw.encode()).digest()))


def encrypt(value: str, secret: SecretStr) -> str:
    return _fernet(secret).encrypt(value.encode()).decode()


def decrypt(value: str, secret: SecretStr) -> str:
    return _fernet(secret).decrypt(value.encode()).decode()
