from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, timezone
from app.core.database import get_db, Collections, new_id, doc_to_dict, build_search_filter
from app.middleware.auth_middleware import get_current_user, require_min_role
from app.middleware.audit_middleware import log_audit
from app.utils.audit import audit_create_fields, audit_update_fields
from app.models.treasury import (
    CashRegistryCreate, CashRegistryUpdate, CashRegistryResponse,
    OpenRegistryPayload, CloseRegistryPayload, RegistryTransactionPayload,
    CashRegistryTransactionResponse,
    BankAccountCreate, BankAccountUpdate, BankAccountResponse,
    BankTransactionPayload, BankAccountTransactionResponse,
    FundTransferCreate, FundTransferResponse,
)
from app.models.common import PaginatedResponse

router = APIRouter(prefix="/treasury", tags=["Treasury"])

# ─── Sort field whitelists ────────────────────────────────────────────────────

REGISTRY_SORT_FIELDS     = {"name", "created_at", "current_balance"}
BANK_ACCOUNT_SORT_FIELDS = {"bank_name", "account_name", "created_at", "current_balance"}
TRANSFER_SORT_FIELDS     = {"transfer_date", "created_at", "amount"}


# ─── Internal helpers ─────────────────────────────────────────────────────────

def _lookup_branch_name(db, branch_id: str) -> str:
    """Return branch name for a given branch_id, or empty string if not found."""
    branch_doc = db[Collections.BRANCHES].find_one({"_id": branch_id})
    return branch_doc.get("name", "") if branch_doc else ""


def _lookup_staff_name(db, staff_id: str | None) -> str | None:
    """Return 'first_name last_name' for a staff member, or None if not found."""
    if not staff_id:
        return None
    staff_doc = db[Collections.STAFF].find_one({"_id": staff_id})
    if not staff_doc:
        return None
    first_name = staff_doc.get("first_name", "")
    last_name  = staff_doc.get("last_name", "")
    return f"{first_name} {last_name}".strip() or None


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


# ═══════════════════════════════════════════════════════════════════════════════
# Cash Registry endpoints
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/registries", response_model=PaginatedResponse[CashRegistryResponse])
async def list_cash_registries(
    search:       str | None  = Query(default=None),
    branch_id:    str | None  = Query(default=None),
    is_active:    bool | None = Query(default=None),
    page:         int         = Query(default=1, ge=1),
    page_size:    int         = Query(default=20, ge=1, le=100),
    sort_by:      str | None  = Query(default="name"),
    sort_dir:     str | None  = Query(default="asc"),
    current_user: dict        = Depends(get_current_user),
):
    db  = get_db()
    flt: dict = {}

    if branch_id:
        flt["branch_id"] = branch_id
    if is_active is not None:
        flt["is_active"] = is_active
    if search:
        flt.update(build_search_filter(search, ["name"]))

    sort_field     = sort_by if sort_by in REGISTRY_SORT_FIELDS else "name"
    sort_direction = -1 if sort_dir == "desc" else 1

    total = db[Collections.CASH_REGISTRIES].count_documents(flt)
    skip  = (page - 1) * page_size
    docs  = (
        db[Collections.CASH_REGISTRIES]
        .find(flt)
        .sort(sort_field, sort_direction)
        .skip(skip)
        .limit(page_size)
    )

    return PaginatedResponse[CashRegistryResponse](
        data=[CashRegistryResponse(**doc_to_dict(d)) for d in docs],
        total=total, page=page, page_size=page_size,
        total_pages=max(1, -(-total // page_size)),
    )


@router.post("/registries", response_model=CashRegistryResponse, status_code=201)
async def create_cash_registry(
    payload:      CashRegistryCreate,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db  = get_db()
    now = datetime.now(timezone.utc).isoformat()

    branch_name           = _lookup_branch_name(db, payload.branch_id)
    responsible_staff_name = _lookup_staff_name(db, payload.responsible_staff_id)

    doc_id = new_id()
    data   = {
        "_id":                    doc_id,
        "name":                   payload.name,
        "branch_id":              payload.branch_id,
        "branch_name":            branch_name,
        "responsible_staff_id":   payload.responsible_staff_id,
        "responsible_staff_name": responsible_staff_name,
        "current_balance":        0.0,
        "is_open":                False,
        "is_active":              True,
        "created_at":             now,
        "updated_at":             now,
        **audit_create_fields(current_user),
    }
    db[Collections.CASH_REGISTRIES].insert_one(data)
    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="CREATE",
        resource="cash_registry", resource_id=doc_id,
    )
    return CashRegistryResponse(**doc_to_dict(data))


@router.get("/registries/{registry_id}", response_model=CashRegistryResponse)
async def get_cash_registry(
    registry_id:  str,
    current_user: dict = Depends(get_current_user),
):
    db  = get_db()
    doc = db[Collections.CASH_REGISTRIES].find_one({"_id": registry_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Cash registry not found")
    return CashRegistryResponse(**doc_to_dict(doc))


@router.patch("/registries/{registry_id}", response_model=CashRegistryResponse)
async def update_cash_registry(
    registry_id:  str,
    payload:      CashRegistryUpdate,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db = get_db()
    if not db[Collections.CASH_REGISTRIES].find_one({"_id": registry_id}):
        raise HTTPException(status_code=404, detail="Cash registry not found")

    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items()}

    # Re-lookup staff name if responsible_staff_id is being changed
    if "responsible_staff_id" in updates:
        updates["responsible_staff_name"] = _lookup_staff_name(db, updates["responsible_staff_id"])

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    updates.update(audit_update_fields(current_user))

    db[Collections.CASH_REGISTRIES].update_one({"_id": registry_id}, {"$set": updates})
    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="UPDATE",
        resource="cash_registry", resource_id=registry_id,
    )
    updated_doc = db[Collections.CASH_REGISTRIES].find_one({"_id": registry_id})
    return CashRegistryResponse(**doc_to_dict(updated_doc))


@router.post("/registries/{registry_id}/open", response_model=CashRegistryResponse)
async def open_cash_registry(
    registry_id:  str,
    payload:      OpenRegistryPayload,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db  = get_db()
    doc = db[Collections.CASH_REGISTRIES].find_one({"_id": registry_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Cash registry not found")

    registry = doc_to_dict(doc)
    if registry["is_open"]:
        raise HTTPException(status_code=400, detail="Cash registry is already open")

    opening_balance = payload.opening_balance
    now             = datetime.now(timezone.utc).isoformat()

    db[Collections.CASH_REGISTRIES].update_one(
        {"_id": registry_id},
        {"$set": {
            "current_balance": opening_balance,
            "is_open":         True,
            "updated_at":      now,
            **audit_update_fields(current_user),
        }},
    )

    _create_cash_transaction(
        db,
        registry_doc    = registry,
        transaction_type = "OPENING",
        amount          = opening_balance,
        balance_before  = 0.0,
        balance_after   = opening_balance,
        notes           = payload.notes,
        current_user    = current_user,
    )

    updated_doc = db[Collections.CASH_REGISTRIES].find_one({"_id": registry_id})
    return CashRegistryResponse(**doc_to_dict(updated_doc))


@router.post("/registries/{registry_id}/close", response_model=CashRegistryResponse)
async def close_cash_registry(
    registry_id:  str,
    payload:      CloseRegistryPayload,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db  = get_db()
    doc = db[Collections.CASH_REGISTRIES].find_one({"_id": registry_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Cash registry not found")

    registry = doc_to_dict(doc)
    if not registry["is_open"]:
        raise HTTPException(status_code=400, detail="Cash registry is not open")

    current_balance = registry["current_balance"]
    discrepancy     = payload.physical_count - current_balance
    now             = datetime.now(timezone.utc).isoformat()

    db[Collections.CASH_REGISTRIES].update_one(
        {"_id": registry_id},
        {"$set": {
            "is_open":    False,
            "updated_at": now,
            **audit_update_fields(current_user),
        }},
    )

    _create_cash_transaction(
        db,
        registry_doc    = registry,
        transaction_type = "CLOSING",
        amount          = 0.0,
        balance_before  = current_balance,
        balance_after   = current_balance,
        physical_count  = payload.physical_count,
        discrepancy     = discrepancy,
        notes           = payload.notes,
        current_user    = current_user,
    )

    updated_doc = db[Collections.CASH_REGISTRIES].find_one({"_id": registry_id})
    return CashRegistryResponse(**doc_to_dict(updated_doc))


@router.post("/registries/{registry_id}/deposit", response_model=CashRegistryResponse)
async def deposit_to_registry(
    registry_id:  str,
    payload:      RegistryTransactionPayload,
    current_user: dict = Depends(require_min_role("BRANCH_USER")),
):
    db  = get_db()
    doc = db[Collections.CASH_REGISTRIES].find_one({"_id": registry_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Cash registry not found")

    registry = doc_to_dict(doc)
    if not registry["is_active"]:
        raise HTTPException(status_code=400, detail="Cash registry is inactive")
    if not registry["is_open"]:
        raise HTTPException(status_code=400, detail="Cash registry is not open")

    balance_before = registry["current_balance"]
    balance_after  = balance_before + payload.amount
    now            = datetime.now(timezone.utc).isoformat()

    db[Collections.CASH_REGISTRIES].update_one(
        {"_id": registry_id},
        {"$set": {
            "current_balance": balance_after,
            "updated_at":      now,
            **audit_update_fields(current_user),
        }},
    )

    _create_cash_transaction(
        db,
        registry_doc    = registry,
        transaction_type = "DEPOSIT",
        amount          = payload.amount,
        balance_before  = balance_before,
        balance_after   = balance_after,
        notes           = payload.notes,
        current_user    = current_user,
    )

    updated_doc = db[Collections.CASH_REGISTRIES].find_one({"_id": registry_id})
    return CashRegistryResponse(**doc_to_dict(updated_doc))


@router.post("/registries/{registry_id}/withdraw", response_model=CashRegistryResponse)
async def withdraw_from_registry(
    registry_id:  str,
    payload:      RegistryTransactionPayload,
    current_user: dict = Depends(require_min_role("BRANCH_USER")),
):
    db  = get_db()
    doc = db[Collections.CASH_REGISTRIES].find_one({"_id": registry_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Cash registry not found")

    registry = doc_to_dict(doc)
    if not registry["is_active"]:
        raise HTTPException(status_code=400, detail="Cash registry is inactive")
    if not registry["is_open"]:
        raise HTTPException(status_code=400, detail="Cash registry is not open")
    if payload.amount > registry["current_balance"]:
        raise HTTPException(status_code=400, detail="Insufficient funds in cash registry")

    balance_before = registry["current_balance"]
    balance_after  = balance_before - payload.amount
    now            = datetime.now(timezone.utc).isoformat()

    db[Collections.CASH_REGISTRIES].update_one(
        {"_id": registry_id},
        {"$set": {
            "current_balance": balance_after,
            "updated_at":      now,
            **audit_update_fields(current_user),
        }},
    )

    _create_cash_transaction(
        db,
        registry_doc    = registry,
        transaction_type = "WITHDRAWAL",
        amount          = payload.amount,
        balance_before  = balance_before,
        balance_after   = balance_after,
        notes           = payload.notes,
        current_user    = current_user,
    )

    updated_doc = db[Collections.CASH_REGISTRIES].find_one({"_id": registry_id})
    return CashRegistryResponse(**doc_to_dict(updated_doc))


@router.get(
    "/registries/{registry_id}/transactions",
    response_model=list[CashRegistryTransactionResponse],
)
async def list_registry_transactions(
    registry_id:  str,
    current_user: dict = Depends(get_current_user),
):
    db  = get_db()
    if not db[Collections.CASH_REGISTRIES].find_one({"_id": registry_id}):
        raise HTTPException(status_code=404, detail="Cash registry not found")

    docs = (
        db[Collections.CASH_REGISTRY_TRANSACTIONS]
        .find({"registry_id": registry_id})
        .sort("created_at", -1)
        .limit(100)
    )
    return [CashRegistryTransactionResponse(**doc_to_dict(d)) for d in docs]


# ═══════════════════════════════════════════════════════════════════════════════
# Bank Account endpoints
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/bank-accounts", response_model=PaginatedResponse[BankAccountResponse])
async def list_bank_accounts(
    search:       str | None  = Query(default=None),
    branch_id:    str | None  = Query(default=None),
    is_active:    bool | None = Query(default=None),
    page:         int         = Query(default=1, ge=1),
    page_size:    int         = Query(default=20, ge=1, le=100),
    sort_by:      str | None  = Query(default="bank_name"),
    sort_dir:     str | None  = Query(default="asc"),
    current_user: dict        = Depends(get_current_user),
):
    db  = get_db()
    flt: dict = {}

    if branch_id:
        flt["branch_id"] = branch_id
    if is_active is not None:
        flt["is_active"] = is_active
    if search:
        flt.update(build_search_filter(search, ["bank_name", "account_name", "account_number"]))

    sort_field     = sort_by if sort_by in BANK_ACCOUNT_SORT_FIELDS else "bank_name"
    sort_direction = -1 if sort_dir == "desc" else 1

    total = db[Collections.BANK_ACCOUNTS].count_documents(flt)
    skip  = (page - 1) * page_size
    docs  = (
        db[Collections.BANK_ACCOUNTS]
        .find(flt)
        .sort(sort_field, sort_direction)
        .skip(skip)
        .limit(page_size)
    )

    return PaginatedResponse[BankAccountResponse](
        data=[BankAccountResponse(**doc_to_dict(d)) for d in docs],
        total=total, page=page, page_size=page_size,
        total_pages=max(1, -(-total // page_size)),
    )


@router.post("/bank-accounts", response_model=BankAccountResponse, status_code=201)
async def create_bank_account(
    payload:      BankAccountCreate,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db  = get_db()
    now = datetime.now(timezone.utc).isoformat()

    branch_name = _lookup_branch_name(db, payload.branch_id)

    doc_id = new_id()
    data   = {
        "_id":             doc_id,
        "bank_name":       payload.bank_name,
        "account_number":  payload.account_number,
        "account_name":    payload.account_name,
        "branch_id":       payload.branch_id,
        "branch_name":     branch_name,
        "current_balance": 0.0,
        "is_active":       True,
        "created_at":      now,
        "updated_at":      now,
        **audit_create_fields(current_user),
    }
    db[Collections.BANK_ACCOUNTS].insert_one(data)
    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="CREATE",
        resource="bank_account", resource_id=doc_id,
    )
    return BankAccountResponse(**doc_to_dict(data))


@router.get("/bank-accounts/{account_id}", response_model=BankAccountResponse)
async def get_bank_account(
    account_id:   str,
    current_user: dict = Depends(get_current_user),
):
    db  = get_db()
    doc = db[Collections.BANK_ACCOUNTS].find_one({"_id": account_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Bank account not found")
    return BankAccountResponse(**doc_to_dict(doc))


@router.patch("/bank-accounts/{account_id}", response_model=BankAccountResponse)
async def update_bank_account(
    account_id:   str,
    payload:      BankAccountUpdate,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db = get_db()
    if not db[Collections.BANK_ACCOUNTS].find_one({"_id": account_id}):
        raise HTTPException(status_code=404, detail="Bank account not found")

    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items()}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    updates.update(audit_update_fields(current_user))

    db[Collections.BANK_ACCOUNTS].update_one({"_id": account_id}, {"$set": updates})
    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="UPDATE",
        resource="bank_account", resource_id=account_id,
    )
    updated_doc = db[Collections.BANK_ACCOUNTS].find_one({"_id": account_id})
    return BankAccountResponse(**doc_to_dict(updated_doc))


@router.post("/bank-accounts/{account_id}/deposit", response_model=BankAccountResponse)
async def deposit_to_bank_account(
    account_id:   str,
    payload:      BankTransactionPayload,
    current_user: dict = Depends(require_min_role("BRANCH_USER")),
):
    db  = get_db()
    doc = db[Collections.BANK_ACCOUNTS].find_one({"_id": account_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Bank account not found")

    account = doc_to_dict(doc)
    if not account["is_active"]:
        raise HTTPException(status_code=400, detail="Bank account is inactive")

    balance_before = account["current_balance"]
    balance_after  = balance_before + payload.amount
    now            = datetime.now(timezone.utc).isoformat()

    db[Collections.BANK_ACCOUNTS].update_one(
        {"_id": account_id},
        {"$set": {
            "current_balance": balance_after,
            "updated_at":      now,
            **audit_update_fields(current_user),
        }},
    )

    _create_bank_transaction(
        db,
        account_doc      = account,
        transaction_type = "DEPOSIT",
        amount           = payload.amount,
        balance_before   = balance_before,
        balance_after    = balance_after,
        notes            = payload.notes,
        current_user     = current_user,
    )

    updated_doc = db[Collections.BANK_ACCOUNTS].find_one({"_id": account_id})
    return BankAccountResponse(**doc_to_dict(updated_doc))


@router.post("/bank-accounts/{account_id}/withdraw", response_model=BankAccountResponse)
async def withdraw_from_bank_account(
    account_id:   str,
    payload:      BankTransactionPayload,
    current_user: dict = Depends(require_min_role("BRANCH_USER")),
):
    db  = get_db()
    doc = db[Collections.BANK_ACCOUNTS].find_one({"_id": account_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Bank account not found")

    account = doc_to_dict(doc)
    if not account["is_active"]:
        raise HTTPException(status_code=400, detail="Bank account is inactive")
    if payload.amount > account["current_balance"]:
        raise HTTPException(status_code=400, detail="Insufficient funds in bank account")

    balance_before = account["current_balance"]
    balance_after  = balance_before - payload.amount
    now            = datetime.now(timezone.utc).isoformat()

    db[Collections.BANK_ACCOUNTS].update_one(
        {"_id": account_id},
        {"$set": {
            "current_balance": balance_after,
            "updated_at":      now,
            **audit_update_fields(current_user),
        }},
    )

    _create_bank_transaction(
        db,
        account_doc      = account,
        transaction_type = "WITHDRAWAL",
        amount           = payload.amount,
        balance_before   = balance_before,
        balance_after    = balance_after,
        notes            = payload.notes,
        current_user     = current_user,
    )

    updated_doc = db[Collections.BANK_ACCOUNTS].find_one({"_id": account_id})
    return BankAccountResponse(**doc_to_dict(updated_doc))


@router.get(
    "/bank-accounts/{account_id}/transactions",
    response_model=list[BankAccountTransactionResponse],
)
async def list_bank_account_transactions(
    account_id:   str,
    current_user: dict = Depends(get_current_user),
):
    db  = get_db()
    if not db[Collections.BANK_ACCOUNTS].find_one({"_id": account_id}):
        raise HTTPException(status_code=404, detail="Bank account not found")

    docs = (
        db[Collections.BANK_ACCOUNT_TRANSACTIONS]
        .find({"account_id": account_id})
        .sort("created_at", -1)
        .limit(100)
    )
    return [BankAccountTransactionResponse(**doc_to_dict(d)) for d in docs]


# ═══════════════════════════════════════════════════════════════════════════════
# Fund Transfer endpoints
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/transfers", response_model=PaginatedResponse[FundTransferResponse])
async def list_fund_transfers(
    branch_id:    str | None = Query(default=None),
    page:         int        = Query(default=1, ge=1),
    page_size:    int        = Query(default=20, ge=1, le=100),
    sort_by:      str | None = Query(default="transfer_date"),
    sort_dir:     str | None = Query(default="desc"),
    current_user: dict       = Depends(get_current_user),
):
    db  = get_db()
    flt: dict = {}

    if branch_id:
        flt["branch_id"] = branch_id

    sort_field     = sort_by if sort_by in TRANSFER_SORT_FIELDS else "transfer_date"
    sort_direction = -1 if sort_dir == "desc" else 1

    total = db[Collections.FUND_TRANSFERS].count_documents(flt)
    skip  = (page - 1) * page_size
    docs  = (
        db[Collections.FUND_TRANSFERS]
        .find(flt)
        .sort(sort_field, sort_direction)
        .skip(skip)
        .limit(page_size)
    )

    return PaginatedResponse[FundTransferResponse](
        data=[FundTransferResponse(**doc_to_dict(d)) for d in docs],
        total=total, page=page, page_size=page_size,
        total_pages=max(1, -(-total // page_size)),
    )


@router.post("/transfers", response_model=FundTransferResponse, status_code=201)
async def create_fund_transfer(
    payload:      FundTransferCreate,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db = get_db()

    # Validate that source and destination are not the same
    if payload.from_source_type == payload.to_source_type and payload.from_source_id == payload.to_source_id:
        raise HTTPException(
            status_code=400,
            detail="Transfer source and destination cannot be the same account",
        )

    # Fetch source document
    from_doc = _get_source_doc(db, payload.from_source_type, payload.from_source_id)
    if not from_doc:
        raise HTTPException(
            status_code=404,
            detail=f"Transfer source ({payload.from_source_type}) not found",
        )

    # Fetch destination document
    to_doc = _get_source_doc(db, payload.to_source_type, payload.to_source_id)
    if not to_doc:
        raise HTTPException(
            status_code=404,
            detail=f"Transfer destination ({payload.to_source_type}) not found",
        )

    # Validate source has sufficient balance
    from_balance = from_doc["current_balance"]
    if payload.amount > from_balance:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient balance in source account. Available: {from_balance:.2f}",
        )

    now             = datetime.now(timezone.utc).isoformat()
    transfer_id     = new_id()
    from_source_name = _source_display_name(payload.from_source_type, from_doc)
    to_source_name   = _source_display_name(payload.to_source_type, to_doc)

    # Branch id recorded from the from_source's branch
    branch_id = from_doc["branch_id"]

    # ── Deduct from source ────────────────────────────────────────────────────
    from_balance_before = from_balance
    from_balance_after  = from_balance_before - payload.amount

    if payload.from_source_type == "CASH_REGISTRY":
        db[Collections.CASH_REGISTRIES].update_one(
            {"_id": payload.from_source_id},
            {"$set": {
                "current_balance": from_balance_after,
                "updated_at":      now,
                **audit_update_fields(current_user),
            }},
        )
        _create_cash_transaction(
            db,
            registry_doc    = from_doc,
            transaction_type = "TRANSFER_OUT",
            amount          = payload.amount,
            balance_before  = from_balance_before,
            balance_after   = from_balance_after,
            notes           = payload.notes,
            reference_id    = transfer_id,
            current_user    = current_user,
        )
    else:
        db[Collections.BANK_ACCOUNTS].update_one(
            {"_id": payload.from_source_id},
            {"$set": {
                "current_balance": from_balance_after,
                "updated_at":      now,
                **audit_update_fields(current_user),
            }},
        )
        _create_bank_transaction(
            db,
            account_doc      = from_doc,
            transaction_type = "TRANSFER_OUT",
            amount           = payload.amount,
            balance_before   = from_balance_before,
            balance_after    = from_balance_after,
            notes            = payload.notes,
            reference_id     = transfer_id,
            current_user     = current_user,
        )

    # ── Add to destination ────────────────────────────────────────────────────
    to_balance_before = to_doc["current_balance"]
    to_balance_after  = to_balance_before + payload.amount

    if payload.to_source_type == "CASH_REGISTRY":
        db[Collections.CASH_REGISTRIES].update_one(
            {"_id": payload.to_source_id},
            {"$set": {
                "current_balance": to_balance_after,
                "updated_at":      now,
                **audit_update_fields(current_user),
            }},
        )
        _create_cash_transaction(
            db,
            registry_doc    = to_doc,
            transaction_type = "TRANSFER_IN",
            amount          = payload.amount,
            balance_before  = to_balance_before,
            balance_after   = to_balance_after,
            notes           = payload.notes,
            reference_id    = transfer_id,
            current_user    = current_user,
        )
    else:
        db[Collections.BANK_ACCOUNTS].update_one(
            {"_id": payload.to_source_id},
            {"$set": {
                "current_balance": to_balance_after,
                "updated_at":      now,
                **audit_update_fields(current_user),
            }},
        )
        _create_bank_transaction(
            db,
            account_doc      = to_doc,
            transaction_type = "TRANSFER_IN",
            amount           = payload.amount,
            balance_before   = to_balance_before,
            balance_after    = to_balance_after,
            notes            = payload.notes,
            reference_id     = transfer_id,
            current_user     = current_user,
        )

    # ── Insert fund transfer record ────────────────────────────────────────────
    transfer_data = {
        "_id":              transfer_id,
        "from_source_type": payload.from_source_type,
        "from_source_id":   payload.from_source_id,
        "from_source_name": from_source_name,
        "to_source_type":   payload.to_source_type,
        "to_source_id":     payload.to_source_id,
        "to_source_name":   to_source_name,
        "amount":           payload.amount,
        "notes":            payload.notes,
        "transfer_date":    payload.transfer_date,
        "branch_id":        branch_id,
        "created_at":       now,
        "created_by_id":    current_user["id"],
        "created_by_name":  current_user.get("full_name", ""),
    }
    db[Collections.FUND_TRANSFERS].insert_one(transfer_data)

    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="CREATE",
        resource="fund_transfer", resource_id=transfer_id,
    )

    return FundTransferResponse(**doc_to_dict(transfer_data))


@router.get("/transfers/{transfer_id}", response_model=FundTransferResponse)
async def get_fund_transfer(
    transfer_id:  str,
    current_user: dict = Depends(get_current_user),
):
    db  = get_db()
    doc = db[Collections.FUND_TRANSFERS].find_one({"_id": transfer_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Fund transfer not found")
    return FundTransferResponse(**doc_to_dict(doc))
