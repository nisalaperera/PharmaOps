from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, date, timezone
from app.core.database import get_db, Collections, new_id, doc_to_dict, build_search_filter
from app.middleware.auth_middleware import get_current_user, require_min_role
from app.middleware.audit_middleware import log_audit
from app.utils.audit import audit_create_fields, audit_update_fields
from app.utils.branch_scope import apply_branch_filter, ensure_branch_access, enforce_branch_on_create
from app.models.treasury import (
    CashRegistryCreate, CashRegistryUpdate, CashRegistryResponse,
    OpenRegistryPayload, CloseRegistryPayload, RegistryTransactionPayload,
    CashRegistryTransactionResponse, CashRegistrySessionResponse,
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
SESSION_SORT_FIELDS      = {"session_date", "opened_at", "closed_at"}

# ─── Cash Over/Short ledger account code ─────────────────────────────────────
CASH_OVER_SHORT_CODE = "6000"


# ─── Internal helpers ─────────────────────────────────────────────────────────

def _lookup_branch_name(db, branch_id: str) -> str:
    branch_doc = db[Collections.BRANCHES].find_one({"_id": branch_id})
    return branch_doc.get("name", "") if branch_doc else ""


def _lookup_staff_name(db, staff_id: str | None) -> str | None:
    if not staff_id:
        return None
    staff_doc = db[Collections.STAFF].find_one({"_id": staff_id})
    if not staff_doc:
        return None
    return f"{staff_doc.get('first_name', '')} {staff_doc.get('last_name', '')}".strip() or None


def _lookup_ledger_account(db, account_id: str | None) -> dict | None:
    if not account_id:
        return None
    doc = db[Collections.LEDGER_ACCOUNTS].find_one({"_id": account_id})
    return doc_to_dict(doc) if doc else None


def _post_variance_journal_entry(
    db,
    *,
    session_id:       str,
    session_date:     str,
    registry_name:    str,
    branch_id:        str,
    registry_account: dict | None,
    variance:         float,
    current_user:     dict,
) -> None:
    """Post a debit/credit journal entry for cash over/short variance."""
    if variance == 0:
        return

    over_short_doc = db[Collections.LEDGER_ACCOUNTS].find_one({"code": CASH_OVER_SHORT_CODE})
    if not over_short_doc:
        return  # System account not yet seeded — skip silently

    over_short = doc_to_dict(over_short_doc)
    now        = datetime.now(timezone.utc).isoformat()

    # Registry account placeholders for when no ledger account is linked
    reg_account_id   = registry_account["id"]   if registry_account else "unlinked"
    reg_account_code = registry_account["code"] if registry_account else "---"
    reg_account_name = registry_account["name"] if registry_account else f"Cash Register ({registry_name})"

    if variance > 0:
        # More cash than expected → DR Cash Register / CR Over-Short
        lines = [
            {"account_id": reg_account_id,      "account_code": reg_account_code, "account_name": reg_account_name,       "debit": abs(variance), "credit": 0.0},
            {"account_id": over_short["id"],     "account_code": over_short["code"], "account_name": over_short["name"],  "debit": 0.0, "credit": abs(variance)},
        ]
        description = f"Cash over on session close — {registry_name} ({session_date})"
    else:
        # Less cash than expected → DR Over-Short / CR Cash Register
        lines = [
            {"account_id": over_short["id"],     "account_code": over_short["code"], "account_name": over_short["name"],  "debit": abs(variance), "credit": 0.0},
            {"account_id": reg_account_id,      "account_code": reg_account_code, "account_name": reg_account_name,       "debit": 0.0, "credit": abs(variance)},
        ]
        description = f"Cash short on session close — {registry_name} ({session_date})"

    db[Collections.JOURNAL_ENTRIES].insert_one({
        "_id":             new_id(),
        "entry_date":      session_date,
        "reference_id":    session_id,
        "reference_type":  "CASH_SESSION_VARIANCE",
        "description":     description,
        "branch_id":       branch_id,
        "lines":           lines,
        "created_at":      now,
        "created_by_id":   current_user["id"],
        "created_by_name": current_user.get("full_name", ""),
    })


# Posting helpers shared with other modules (e.g. payroll) live in utils
from app.utils.treasury_posting import (
    _get_source_doc, _source_display_name,
    _create_cash_transaction, _create_bank_transaction,
)


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
    apply_branch_filter(flt, current_user, branch_id)
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
    payload.branch_id = enforce_branch_on_create(payload.branch_id, current_user)

    branch_name            = _lookup_branch_name(db, payload.branch_id)
    responsible_staff_name = _lookup_staff_name(db, payload.responsible_staff_id)
    ledger_account         = _lookup_ledger_account(db, payload.ledger_account_id)

    doc_id = new_id()
    data   = {
        "_id":                    doc_id,
        "name":                   payload.name,
        "branch_id":              payload.branch_id,
        "branch_name":            branch_name,
        "responsible_staff_id":   payload.responsible_staff_id,
        "responsible_staff_name": responsible_staff_name,
        "ledger_account_id":      payload.ledger_account_id,
        "ledger_account_code":    ledger_account["code"] if ledger_account else None,
        "ledger_account_name":    ledger_account["name"] if ledger_account else None,
        "current_balance":        0.0,
        "current_session_id":     None,
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
    registry = doc_to_dict(doc)
    ensure_branch_access(registry, current_user)
    return CashRegistryResponse(**registry)


@router.patch("/registries/{registry_id}", response_model=CashRegistryResponse)
async def update_cash_registry(
    registry_id:  str,
    payload:      CashRegistryUpdate,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db  = get_db()
    doc = db[Collections.CASH_REGISTRIES].find_one({"_id": registry_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Cash registry not found")
    ensure_branch_access(doc_to_dict(doc), current_user)

    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items()}

    if "responsible_staff_id" in updates:
        updates["responsible_staff_name"] = _lookup_staff_name(db, updates["responsible_staff_id"])

    if "ledger_account_id" in updates:
        ledger_account = _lookup_ledger_account(db, updates["ledger_account_id"])
        updates["ledger_account_code"] = ledger_account["code"] if ledger_account else None
        updates["ledger_account_name"] = ledger_account["name"] if ledger_account else None

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


# ─── Session: check previous-day unclosed ────────────────────────────────────

@router.get("/registries/{registry_id}/unclosed-session")
async def get_unclosed_previous_session(
    registry_id:  str,
    current_user: dict = Depends(get_current_user),
):
    """Returns the unclosed session from a previous date, or null."""
    db  = get_db()
    doc = db[Collections.CASH_REGISTRIES].find_one({"_id": registry_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Cash registry not found")
    ensure_branch_access(doc_to_dict(doc), current_user)

    today = date.today().isoformat()
    unclosed = db[Collections.CASH_REGISTRY_SESSIONS].find_one({
        "registry_id":  registry_id,
        "status":       "OPEN",
        "session_date": {"$lt": today},
    })
    if not unclosed:
        return {"session": None}
    return {"session": CashRegistrySessionResponse(**doc_to_dict(unclosed))}


# ─── Session: open ────────────────────────────────────────────────────────────

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
    ensure_branch_access(registry, current_user)

    if registry["is_open"]:
        raise HTTPException(status_code=400, detail="Cash registry already has an open session")

    today = date.today().isoformat()

    # Block if there is an unclosed session from a previous date
    unclosed_previous = db[Collections.CASH_REGISTRY_SESSIONS].find_one({
        "registry_id":  registry_id,
        "status":       "OPEN",
        "session_date": {"$lt": today},
    })
    if unclosed_previous:
        prev = doc_to_dict(unclosed_previous)
        raise HTTPException(
            status_code=409,
            detail=(
                f"Registry has an unclosed session from {prev['session_date']}. "
                f"Please close that session first (session ID: {prev['id']})."
            ),
        )

    opening_balance = payload.denominations.total()
    now             = datetime.now(timezone.utc).isoformat()
    session_id      = new_id()

    # Create session document
    session_data = {
        "_id":                    session_id,
        "registry_id":            registry_id,
        "registry_name":          registry["name"],
        "branch_id":              registry["branch_id"],
        "session_date":           today,
        "status":                 "OPEN",
        "opening_denominations":  payload.denominations.model_dump(),
        "opening_balance":        opening_balance,
        "opening_notes":          payload.notes,
        "opened_at":              now,
        "opened_by_id":           current_user["id"],
        "opened_by_name":         current_user.get("full_name", ""),
        "closing_denominations":  None,
        "closing_balance":        None,
        "expected_balance":       None,
        "variance":               None,
        "closing_notes":          None,
        "closed_at":              None,
        "closed_by_id":           None,
        "closed_by_name":         None,
    }
    db[Collections.CASH_REGISTRY_SESSIONS].insert_one(session_data)

    # Update registry
    db[Collections.CASH_REGISTRIES].update_one(
        {"_id": registry_id},
        {"$set": {
            "current_balance":    opening_balance,
            "current_session_id": session_id,
            "is_open":            True,
            "updated_at":         now,
            **audit_update_fields(current_user),
        }},
    )

    _create_cash_transaction(
        db,
        registry_doc     = registry,
        transaction_type = "OPENING",
        amount           = opening_balance,
        balance_before   = 0.0,
        balance_after    = opening_balance,
        notes            = payload.notes,
        current_user     = current_user,
    )

    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="CREATE",
        resource="cash_registry_session", resource_id=session_id,
    )

    updated_doc = db[Collections.CASH_REGISTRIES].find_one({"_id": registry_id})
    return CashRegistryResponse(**doc_to_dict(updated_doc))


# ─── Session: close ───────────────────────────────────────────────────────────

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
    ensure_branch_access(registry, current_user)

    if not registry["is_open"]:
        raise HTTPException(status_code=400, detail="Cash registry has no open session")

    session_id = registry.get("current_session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="No active session found for this registry")

    session_doc = db[Collections.CASH_REGISTRY_SESSIONS].find_one({"_id": session_id})
    if not session_doc:
        raise HTTPException(status_code=404, detail="Active session record not found")

    expected_balance = registry["current_balance"]
    closing_balance  = payload.denominations.total()
    variance         = closing_balance - expected_balance
    now              = datetime.now(timezone.utc).isoformat()

    # Update session
    db[Collections.CASH_REGISTRY_SESSIONS].update_one(
        {"_id": session_id},
        {"$set": {
            "status":                "CLOSED",
            "closing_denominations": payload.denominations.model_dump(),
            "closing_balance":       closing_balance,
            "expected_balance":      expected_balance,
            "variance":              variance,
            "closing_notes":         payload.notes,
            "closed_at":             now,
            "closed_by_id":          current_user["id"],
            "closed_by_name":        current_user.get("full_name", ""),
        }},
    )

    # Update registry — the physical count is what's actually in the drawer,
    # so it becomes the registry balance (variance is journalled below).
    db[Collections.CASH_REGISTRIES].update_one(
        {"_id": registry_id},
        {"$set": {
            "is_open":            False,
            "current_session_id": None,
            "current_balance":    closing_balance,
            "updated_at":         now,
            **audit_update_fields(current_user),
        }},
    )

    _create_cash_transaction(
        db,
        registry_doc     = registry,
        transaction_type = "CLOSING",
        amount           = 0.0,
        balance_before   = expected_balance,
        balance_after    = expected_balance,
        physical_count   = closing_balance,
        discrepancy      = variance,
        notes            = payload.notes,
        current_user     = current_user,
    )

    # Post variance journal entry if variance is non-zero
    if variance != 0:
        ledger_account = _lookup_ledger_account(db, registry.get("ledger_account_id"))
        _post_variance_journal_entry(
            db,
            session_id       = session_id,
            session_date     = doc_to_dict(session_doc)["session_date"],
            registry_name    = registry["name"],
            branch_id        = registry["branch_id"],
            registry_account = ledger_account,
            variance         = variance,
            current_user     = current_user,
        )

    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="UPDATE",
        resource="cash_registry_session", resource_id=session_id,
    )

    updated_doc = db[Collections.CASH_REGISTRIES].find_one({"_id": registry_id})
    return CashRegistryResponse(**doc_to_dict(updated_doc))


# ─── Session: list + current ─────────────────────────────────────────────────

@router.get(
    "/registries/{registry_id}/sessions",
    response_model=PaginatedResponse[CashRegistrySessionResponse],
)
async def list_registry_sessions(
    registry_id:  str,
    status:       str | None = Query(default=None),
    page:         int        = Query(default=1, ge=1),
    page_size:    int        = Query(default=20, ge=1, le=100),
    sort_by:      str | None = Query(default="session_date"),
    sort_dir:     str | None = Query(default="desc"),
    current_user: dict       = Depends(get_current_user),
):
    db  = get_db()
    reg_doc = db[Collections.CASH_REGISTRIES].find_one({"_id": registry_id})
    if not reg_doc:
        raise HTTPException(status_code=404, detail="Cash registry not found")
    ensure_branch_access(doc_to_dict(reg_doc), current_user)

    flt: dict = {"registry_id": registry_id}
    if status:
        flt["status"] = status

    sort_field     = sort_by if sort_by in SESSION_SORT_FIELDS else "session_date"
    sort_direction = -1 if sort_dir == "desc" else 1

    total = db[Collections.CASH_REGISTRY_SESSIONS].count_documents(flt)
    skip  = (page - 1) * page_size
    docs  = (
        db[Collections.CASH_REGISTRY_SESSIONS]
        .find(flt)
        .sort(sort_field, sort_direction)
        .skip(skip)
        .limit(page_size)
    )

    return PaginatedResponse[CashRegistrySessionResponse](
        data=[CashRegistrySessionResponse(**doc_to_dict(d)) for d in docs],
        total=total, page=page, page_size=page_size,
        total_pages=max(1, -(-total // page_size)),
    )


@router.get(
    "/registries/{registry_id}/current-session",
    response_model=CashRegistrySessionResponse | None,
)
async def get_current_session(
    registry_id:  str,
    current_user: dict = Depends(get_current_user),
):
    db  = get_db()
    reg_doc = db[Collections.CASH_REGISTRIES].find_one({"_id": registry_id})
    if not reg_doc:
        raise HTTPException(status_code=404, detail="Cash registry not found")
    registry = doc_to_dict(reg_doc)
    ensure_branch_access(registry, current_user)

    session_id = registry.get("current_session_id")
    if not session_id:
        return None

    session_doc = db[Collections.CASH_REGISTRY_SESSIONS].find_one({"_id": session_id})
    if not session_doc:
        return None
    return CashRegistrySessionResponse(**doc_to_dict(session_doc))


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
    ensure_branch_access(registry, current_user)
    if not registry["is_active"]:
        raise HTTPException(status_code=400, detail="Cash registry is inactive")
    if not registry["is_open"]:
        raise HTTPException(status_code=400, detail="Cash registry has no open session")

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
        registry_doc     = registry,
        transaction_type = "DEPOSIT",
        amount           = payload.amount,
        balance_before   = balance_before,
        balance_after    = balance_after,
        notes            = payload.notes,
        current_user     = current_user,
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
    ensure_branch_access(registry, current_user)
    if not registry["is_active"]:
        raise HTTPException(status_code=400, detail="Cash registry is inactive")
    if not registry["is_open"]:
        raise HTTPException(status_code=400, detail="Cash registry has no open session")
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
        registry_doc     = registry,
        transaction_type = "WITHDRAWAL",
        amount           = payload.amount,
        balance_before   = balance_before,
        balance_after    = balance_after,
        notes            = payload.notes,
        current_user     = current_user,
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
    reg_doc = db[Collections.CASH_REGISTRIES].find_one({"_id": registry_id})
    if not reg_doc:
        raise HTTPException(status_code=404, detail="Cash registry not found")
    ensure_branch_access(doc_to_dict(reg_doc), current_user)

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
    apply_branch_filter(flt, current_user, branch_id)
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
    payload.branch_id = enforce_branch_on_create(payload.branch_id, current_user)

    branch_name    = _lookup_branch_name(db, payload.branch_id)
    ledger_account = _lookup_ledger_account(db, payload.ledger_account_id)

    doc_id = new_id()
    data   = {
        "_id":                 doc_id,
        "bank_name":           payload.bank_name,
        "account_number":      payload.account_number,
        "account_name":        payload.account_name,
        "branch_id":           payload.branch_id,
        "branch_name":         branch_name,
        "ledger_account_id":   payload.ledger_account_id,
        "ledger_account_code": ledger_account["code"] if ledger_account else None,
        "ledger_account_name": ledger_account["name"] if ledger_account else None,
        "current_balance":     0.0,
        "is_active":           True,
        "created_at":          now,
        "updated_at":          now,
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
    account = doc_to_dict(doc)
    ensure_branch_access(account, current_user)
    return BankAccountResponse(**account)


@router.patch("/bank-accounts/{account_id}", response_model=BankAccountResponse)
async def update_bank_account(
    account_id:   str,
    payload:      BankAccountUpdate,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db  = get_db()
    doc = db[Collections.BANK_ACCOUNTS].find_one({"_id": account_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Bank account not found")
    ensure_branch_access(doc_to_dict(doc), current_user)

    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items()}

    if "ledger_account_id" in updates:
        ledger_account = _lookup_ledger_account(db, updates["ledger_account_id"])
        updates["ledger_account_code"] = ledger_account["code"] if ledger_account else None
        updates["ledger_account_name"] = ledger_account["name"] if ledger_account else None

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
    ensure_branch_access(account, current_user)
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
    ensure_branch_access(account, current_user)
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
    acct_doc = db[Collections.BANK_ACCOUNTS].find_one({"_id": account_id})
    if not acct_doc:
        raise HTTPException(status_code=404, detail="Bank account not found")
    ensure_branch_access(doc_to_dict(acct_doc), current_user)

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
    apply_branch_filter(flt, current_user, branch_id)

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

    if payload.from_source_type == payload.to_source_type and payload.from_source_id == payload.to_source_id:
        raise HTTPException(status_code=400, detail="Transfer source and destination cannot be the same account")

    from_doc = _get_source_doc(db, payload.from_source_type, payload.from_source_id)
    if not from_doc:
        raise HTTPException(status_code=404, detail=f"Transfer source ({payload.from_source_type}) not found")

    to_doc = _get_source_doc(db, payload.to_source_type, payload.to_source_id)
    if not to_doc:
        raise HTTPException(status_code=404, detail=f"Transfer destination ({payload.to_source_type}) not found")

    for label, source_type, doc in (("source", payload.from_source_type, from_doc), ("destination", payload.to_source_type, to_doc)):
        if not doc.get("is_active", True):
            raise HTTPException(status_code=400, detail=f"Transfer {label} is inactive")
        if source_type == "CASH_REGISTRY" and not doc.get("is_open"):
            raise HTTPException(status_code=400, detail=f"Transfer {label} cash register has no open session")

    from_balance = from_doc["current_balance"]
    if payload.amount > from_balance:
        raise HTTPException(status_code=400, detail=f"Insufficient balance. Available: {from_balance:.2f}")

    now              = datetime.now(timezone.utc).isoformat()
    transfer_id      = new_id()
    from_source_name = _source_display_name(payload.from_source_type, from_doc)
    to_source_name   = _source_display_name(payload.to_source_type, to_doc)
    branch_id        = from_doc["branch_id"]

    from_balance_before = from_balance
    from_balance_after  = from_balance_before - payload.amount

    if payload.from_source_type == "CASH_REGISTRY":
        db[Collections.CASH_REGISTRIES].update_one(
            {"_id": payload.from_source_id},
            {"$set": {"current_balance": from_balance_after, "updated_at": now, **audit_update_fields(current_user)}},
        )
        _create_cash_transaction(db, registry_doc=from_doc, transaction_type="TRANSFER_OUT",
            amount=payload.amount, balance_before=from_balance_before, balance_after=from_balance_after,
            notes=payload.notes, reference_id=transfer_id, current_user=current_user)
    else:
        db[Collections.BANK_ACCOUNTS].update_one(
            {"_id": payload.from_source_id},
            {"$set": {"current_balance": from_balance_after, "updated_at": now, **audit_update_fields(current_user)}},
        )
        _create_bank_transaction(db, account_doc=from_doc, transaction_type="TRANSFER_OUT",
            amount=payload.amount, balance_before=from_balance_before, balance_after=from_balance_after,
            notes=payload.notes, reference_id=transfer_id, current_user=current_user)

    to_balance_before = to_doc["current_balance"]
    to_balance_after  = to_balance_before + payload.amount

    if payload.to_source_type == "CASH_REGISTRY":
        db[Collections.CASH_REGISTRIES].update_one(
            {"_id": payload.to_source_id},
            {"$set": {"current_balance": to_balance_after, "updated_at": now, **audit_update_fields(current_user)}},
        )
        _create_cash_transaction(db, registry_doc=to_doc, transaction_type="TRANSFER_IN",
            amount=payload.amount, balance_before=to_balance_before, balance_after=to_balance_after,
            notes=payload.notes, reference_id=transfer_id, current_user=current_user)
    else:
        db[Collections.BANK_ACCOUNTS].update_one(
            {"_id": payload.to_source_id},
            {"$set": {"current_balance": to_balance_after, "updated_at": now, **audit_update_fields(current_user)}},
        )
        _create_bank_transaction(db, account_doc=to_doc, transaction_type="TRANSFER_IN",
            amount=payload.amount, balance_before=to_balance_before, balance_after=to_balance_after,
            notes=payload.notes, reference_id=transfer_id, current_user=current_user)

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
    transfer = doc_to_dict(doc)
    ensure_branch_access(transfer, current_user)
    return FundTransferResponse(**transfer)
