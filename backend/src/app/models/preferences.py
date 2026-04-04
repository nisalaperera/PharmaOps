from pydantic import BaseModel
from typing import Literal

ThemeOption = Literal["light", "dark", "system"]


class UserPreferencesUpdate(BaseModel):
    theme: ThemeOption = "system"


class UserPreferencesResponse(BaseModel):
    user_id: str
    theme:   ThemeOption = "system"
