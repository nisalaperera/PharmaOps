from datetime import datetime, timezone
from app.database import get_db, Collections, new_id


async def log_audit(
    user_id:     str,
    user_email:  str,
    user_role:   str,
    action:      str,
    resource:    str,
    resource_id: str | None = None,
    branch_id:   str | None = None,
    details:     dict | None = None,
    ip_address:  str | None = None,
) -> None:
    try:
        db = get_db()
        db[Collections.AUDIT_LOGS].insert_one({
            "_id":         new_id(),
            "user_id":     user_id,
            "user_email":  user_email,
            "user_role":   user_role,
            "action":      action,
            "resource":    resource,
            "resource_id": resource_id,
            "branch_id":   branch_id,
            "details":     details or {},
            "ip_address":  ip_address,
            "timestamp":   datetime.now(timezone.utc).isoformat(),
        })
    except Exception:
        pass  # Audit log failures must never break the main request
