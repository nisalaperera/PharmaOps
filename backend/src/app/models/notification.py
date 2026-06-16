from pydantic import BaseModel
from typing import Optional, Literal

NotificationType = Literal[
    "LOW_STOCK", "EXPIRY_ALERT", "PO_APPROVAL", "TRANSFER_REQUEST", "PAYMENT_DUE", "SYSTEM"
]


class NotificationResponse(BaseModel):
    id:         str
    user_id:    str
    branch_id:  Optional[str] = None
    type:       NotificationType
    title:      str
    message:    str
    is_read:    bool = False
    action_url: Optional[str] = None
    created_at: Optional[str] = None
