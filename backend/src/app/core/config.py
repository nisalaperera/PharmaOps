from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
from pathlib import Path

# Resolves to backend/.env regardless of where uvicorn is launched from
_ENV_FILE = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        case_sensitive=False,
        extra="ignore",
    )

    # MongoDB
    mongodb_url:     str
    mongodb_db_name: str = "pharmaops"

    # JWT
    jwt_secret:      str
    jwt_algorithm:   str = "HS256"
    jwt_expiry_hours: int = 8

    # App
    app_env:         str = "development"
    allowed_origins: str = "http://localhost:3000"

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",")]


@lru_cache
def get_settings() -> Settings:
    return Settings()
