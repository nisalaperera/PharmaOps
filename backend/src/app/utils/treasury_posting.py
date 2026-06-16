"""
Shared helpers for posting transactions against cash registries and bank
accounts. Extracted from api/v1/treasury.py so other modules (e.g. payroll)
can post treasury transactions without duplicating the logic.
"""
from datetime import datetime, timezone
from app.core.database import Collections, new_id, doc_to_dict


def _get_source_doc(db, source_type: str, source_id: str) -> dict | None:
    """Fetch a cash registry or bank account document by type and id."""
    if source_type == "CASH_REGISTRY":
        doc = db[Collections.CASH_REGISTRIES].find_one({"_id": source_id})
    else:
        doc = db[Collections.BANK_ACCOUNTS].find_one({"_id": source_id})
    return doc_to_dict(doc) if doc else None


def _source_display_name(source_type: str, source_doc: dict) -> str:
    """Return a human-readable name for a cash registry or bank account."""
    if source_type == "CASH_REGISTRY":
        return source_doc.get("name", "")
    return source_doc.get("account_name", "")


def _create_cash_transaction(
    db,
    *,
    registry_doc:   dict,
    transaction_type: str,
    amount:         float,
    balance_before: float,
    balance_after:  float,
    physical_count: float | None = None,
    discrepancy:    float | None = None,
    notes:          str | None   = None,
    reference_id:   str | None   = None,
    current_user:   dict,
) -> None:
    """Insert a CASH_REGISTRY_TRANSACTIONS record."""
    now    = datetime.now(timezone.utc).isoformat()
    doc_id = new_id()
    db[Collections.CASH_REGISTRY_TRANSACTIONS].insert_one({
        "_id":           doc_id,
        "registry_id":   registry_doc["id"],
        "registry_name": registry_doc["name"],
        "branch_id":     registry_doc["branch_id"],
        "type":          transaction_type,
        "amount":        amount,
        "balance_before": balance_before,
        "balance_after": balance_after,
        "physical_count": physical_count,
        "discrepancy":   discrepancy,
        "notes":         notes,
        "reference_id":  reference_id,
        "created_at":    now,
        "created_by_id":   current_user["id"],
        "created_by_name": current_user.get("full_name", ""),
    })


def _create_bank_transaction(
    db,
    *,
    account_doc:      dict,
    transaction_type: str,
    amount:           float,
    balance_before:   float,
    balance_after:    float,
    notes:            str | None = None,
    reference_id:     str | None = None,
    current_user:     dict,
) -> None:
    """Insert a BANK_ACCOUNT_TRANSACTIONS record."""
    now    = datetime.now(timezone.utc).isoformat()
    doc_id = new_id()
    db[Collections.BANK_ACCOUNT_TRANSACTIONS].insert_one({
        "_id":           doc_id,
        "account_id":    account_doc["id"],
        "account_name":  account_doc["account_name"],
        "branch_id":     account_doc["branch_id"],
        "type":          transaction_type,
        "amount":        amount,
        "balance_before": balance_before,
        "balance_after": balance_after,
        "notes":         notes,
        "reference_id":  reference_id,
        "created_at":    now,
        "created_by_id":   current_user["id"],
        "created_by_name": current_user.get("full_name", ""),
    })
