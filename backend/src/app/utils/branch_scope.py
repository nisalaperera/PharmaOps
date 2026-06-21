from fastapi import HTTPException, status

BRANCH_LEVEL_ROLES = {"BRANCH_ADMIN", "BRANCH_MANAGER", "BRANCH_USER"}


def effective_branch_id(
    current_user: dict, requested_branch_id: str | None = None
) -> str | None:
    if current_user["role"] in BRANCH_LEVEL_ROLES:
        return current_user["branch_id"]
    return requested_branch_id


def apply_branch_filter(
    flt: dict, current_user: dict, requested_branch_id: str | None = None
) -> None:
    branch_id = effective_branch_id(current_user, requested_branch_id)
    if branch_id:
        flt["branch_id"] = branch_id


def ensure_branch_access(doc: dict, current_user: dict) -> None:
    if current_user["role"] not in BRANCH_LEVEL_ROLES:
        return
    if doc.get("branch_id") != current_user.get("branch_id"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Not found",
        )


def enforce_branch_on_create(
    payload_branch_id: str | None, current_user: dict
) -> str:
    if current_user["role"] in BRANCH_LEVEL_ROLES:
        return current_user["branch_id"]
    if payload_branch_id:
        return payload_branch_id
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="branch_id is required",
    )
