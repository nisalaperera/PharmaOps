"""
Shared helpers for stamping created_by / updated_by fields from the
current authenticated user dict (as returned by get_current_user).
"""


def audit_create_fields(current_user: dict) -> dict:
    """Fields to merge into a document at INSERT time."""
    return {
        "created_by_id":   current_user["id"],
        "created_by_name": current_user.get("full_name", ""),
        "updated_by_id":   current_user["id"],
        "updated_by_name": current_user.get("full_name", ""),
    }


def audit_update_fields(current_user: dict) -> dict:
    """Fields to merge into a document at UPDATE time."""
    return {
        "updated_by_id":   current_user["id"],
        "updated_by_name": current_user.get("full_name", ""),
    }
