from datetime import datetime, timedelta, timezone
from app.core.config import get_settings
from app.core.database import get_db, Collections, new_id


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
        db  = get_db()
        now = datetime.now(timezone.utc)

        doc = {
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
            "timestamp":   now.isoformat(),
        }

        # Real datetime (not ISO string) so a TTL index can expire old entries
        retention_days = get_settings().audit_log_retention_days
        if retention_days > 0:
            doc["expires_at"] = now + timedelta(days=retention_days)

        db[Collections.AUDIT_LOGS].insert_one(doc)
    except Exception:
        pass  # Audit log failures must never break the main request
