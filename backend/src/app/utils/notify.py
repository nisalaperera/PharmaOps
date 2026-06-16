"""
Helper for producing in-app notifications. Failures must never break the
main request, mirroring log_audit.
"""
from datetime import datetime, timezone
from app.core.database import Collections, new_id


def create_notification(
    db,
    *,
    user_id:    str,
    type:       str,
    title:      str,
    message:    str,
    branch_id:  str | None = None,
    action_url: str | None = None,
) -> None:
    try:
        db[Collections.NOTIFICATIONS].insert_one({
            "_id":        new_id(),
            "user_id":    user_id,
            "branch_id":  branch_id,
            "type":       type,
            "title":      title,
            "message":    message,
            "action_url": action_url,
            "is_read":    False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:
        pass


def notify_branch_users(
    db,
    *,
    branch_id:  str,
    type:       str,
    title:      str,
    message:    str,
    action_url: str | None = None,
    exclude_user_id: str | None = None,
) -> None:
    """Notify every active user of a branch (optionally excluding the actor)."""
    try:
        users = db[Collections.USERS].find(
            {"branch_id": branch_id, "status": "ACTIVE"},
            {"_id": 1},
        )
        for user in users:
            if exclude_user_id and user["_id"] == exclude_user_id:
                continue
            create_notification(
                db,
                user_id=user["_id"],
                type=type,
                title=title,
                message=message,
                branch_id=branch_id,
                action_url=action_url,
            )
    except Exception:
        pass
