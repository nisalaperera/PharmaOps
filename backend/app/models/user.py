from pydantic import BaseModel, EmailStr, Field
from typing import Optional, Literal
from app.models.common import TimestampMixin

UserRole   = Literal["ADMIN", "MANAGER", "BRANCH_ADMIN", "BRANCH_MANAGER", "BRANCH_USER"]
UserStatus = Literal["ACTIVE", "INACTIVE", "SUSPENDED"]

ROLE_HIERARCHY = ["BRANCH_USER", "BRANCH_MANAGER", "BRANCH_ADMIN", "MANAGER", "ADMIN"]


def has_permission(user_role: str, required_role: str) -> bool:
    return ROLE_HIERARCHY.index(user_role) >= ROLE_HIERARCHY.index(required_role)


class UserBase(BaseModel):
    email:     EmailStr
    full_name: str = Field(min_length=2, max_length=100)
    role:      UserRole
    branch_id: Optional[str] = None
    phone:     Optional[str] = None
    status:    UserStatus = "ACTIVE"


class UserCreate(UserBase):
    password: str = Field(min_length=8)


class UserUpdate(BaseModel):
    full_name: Optional[str]       = None
    phone:     Optional[str]       = None
    role:      Optional[UserRole]  = None
    status:    Optional[UserStatus] = None
    branch_id: Optional[str]       = None


class UserPasswordChange(BaseModel):
    current_password: str
    new_password:     str = Field(min_length=8)


class UserPasswordReset(BaseModel):
    new_password: str = Field(min_length=8)


class UserResponse(UserBase, TimestampMixin):
    id:             str
    last_login_at:  Optional[str] = None


class LoginRequest(BaseModel):
    email:    EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    user:         UserResponse
