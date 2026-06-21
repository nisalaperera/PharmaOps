from datetime import datetime, timezone
from pymongo.database import Database
from app.core.config import get_settings
from app.core.database import Collections


def generate_document_number(
    db: Database,
    branch_code: str,
    doc_type: str,
    ref_date: str | None = None,
) -> str:
    """
    Generate an atomic, human-readable document number.

    Format: {CHAIN_PREFIX}/{BRANCH_CODE}/{DOC_TYPE}/{yyyy}/{MM}/{dd}/{SEQ}
    Example: MG/BR01/SI/2024/12/30/001

    Sequence is allocated atomically via MongoDB findOneAndUpdate ($inc)
    and resets per date+branch+doc_type.
    """
    settings = get_settings()
    prefix   = settings.chain_prefix

    if ref_date:
        date_part = ref_date[:10]
    else:
        date_part = datetime.now(timezone.utc).date().isoformat()

    yyyy, mm, dd = date_part.split("-")
    counter_key  = f"{branch_code}/{doc_type}/{yyyy}/{mm}/{dd}"

    result = db[Collections.SEQUENCES].find_one_and_update(
        {"_id": counter_key},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )

    seq = result["seq"]
    return f"{prefix}/{branch_code}/{doc_type}/{yyyy}/{mm}/{dd}/{seq:03d}"


def get_branch_code(db: Database, branch_id: str) -> str:
    branch = db[Collections.BRANCHES].find_one({"_id": branch_id}, {"code": 1})
    return branch["code"] if branch and branch.get("code") else "XX"
