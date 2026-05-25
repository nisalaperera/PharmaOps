import math
from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, timezone
from pymongo import ASCENDING, DESCENDING
from app.core.database import get_db, Collections, new_id, doc_to_dict, build_search_filter
from app.middleware.auth_middleware import get_current_user, require_min_role
from app.middleware.audit_middleware import log_audit
from app.utils.audit import audit_create_fields, audit_update_fields
from app.models.pos_machine import (
    PosMachineCreate, PosMachineUpdate, PosMachineResponse,
    PosTransactionCreate, PosTransactionResponse,
    PosSettleRequest, PosSettlementResponse,
)
from app.models.common import PaginatedResponse

router = APIRouter(prefix="/treasury/bank-accounts/pos-machines", tags=["Treasury"])

MACHINE_SORT_FIELDS     = {"terminal_id", "created_at", "unsettled_amount"}
TRANSACTION_SORT_FIELDS = {"transaction_date", "amount", "created_at"}


# ─── POS Machines ─────────────────────────────────────────────────────────────

@router.get("/machines", response_model=PaginatedResponse[PosMachineResponse])
async def list_pos_machines(
    page:            int        = Query(1, ge=1),
    page_size:       int        = Query(20, ge=1, le=100),
    sort_by:         str        = Query("created_at"),
    sort_dir:        str        = Query("desc"),
    search:          str | None = Query(None),
    bank_account_id: str | None = Query(None),
    is_active:       str | None = Query(None),
    current_user:    dict       = Depends(get_current_user),
):
    db    = get_db()
    query: dict = {}
    if bank_account_id:
        query["bank_account_id"] = bank_account_id
    if is_active is not None and is_active != "":
        query["is_active"] = is_active.lower() == "true"
    if search:
        query.update(build_search_filter(search, ["terminal_id", "merchant_id", "bank_account_name", "bank_name", "branch_name"]))

    sort_field = sort_by if sort_by in MACHINE_SORT_FIELDS else "created_at"
    sort_order = ASCENDING if sort_dir == "asc" else DESCENDING

    total    = db[Collections.POS_MACHINES].count_documents(query)
    skip     = (page - 1) * page_size
    raw_docs = db[Collections.POS_MACHINES].find(query).sort(sort_field, sort_order).skip(skip).limit(page_size)

    return {
        "data":        [doc_to_dict(d) for d in raw_docs],
        "total":       total,
        "page":        page,
        "page_size":   page_size,
        "total_pages": math.ceil(total / page_size) if total > 0 else 1,
    }


@router.post("/machines", response_model=PosMachineResponse, status_code=201)
async def create_pos_machine(
    payload:      PosMachineCreate,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db          = get_db()
    account_doc = db[Collections.BANK_ACCOUNTS].find_one({"_id": payload.bank_account_id})
    if not account_doc:
        raise HTTPException(status_code=404, detail="Bank account not found")
    if not account_doc.get("is_active", False):
        raise HTTPException(status_code=400, detail="Bank account is inactive")

    branch_doc  = db[Collections.BRANCHES].find_one({"_id": account_doc["branch_id"]})
    branch_name = branch_doc.get("name", "") if branch_doc else ""

    now    = datetime.now(timezone.utc).isoformat()
    doc_id = new_id()
    doc    = {
        "_id":               doc_id,
        "bank_account_id":   payload.bank_account_id,
        "bank_account_name": account_doc.get("account_name", ""),
        "bank_name":         account_doc.get("bank_name", ""),
        "branch_id":         account_doc["branch_id"],
        "branch_name":       branch_name,
        "terminal_id":       payload.terminal_id,
        "merchant_id":       payload.merchant_id,
        "unsettled_amount":  0.0,
        "last_settled_at":   None,
        "is_active":         True,
        "notes":             payload.notes,
        "created_at":        now,
        "updated_at":        now,
        **audit_create_fields(current_user),
    }
    db[Collections.POS_MACHINES].insert_one(doc)
    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="CREATE",
        resource="pos_machine", resource_id=doc_id,
    )
    return doc_to_dict(doc)


@router.patch("/machines/{machine_id}", response_model=PosMachineResponse)
async def update_pos_machine(
    machine_id:   str,
    payload:      PosMachineUpdate,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db  = get_db()
    doc = db[Collections.POS_MACHINES].find_one({"_id": machine_id})
    if not doc:
        raise HTTPException(status_code=404, detail="POS machine not found")

    updates = payload.model_dump(exclude_none=True)
    if not updates:
        return doc_to_dict(doc)

    now = datetime.now(timezone.utc).isoformat()
    updates["updated_at"] = now
    updates.update(audit_update_fields(current_user))

    db[Collections.POS_MACHINES].update_one({"_id": machine_id}, {"$set": updates})
    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="UPDATE",
        resource="pos_machine", resource_id=machine_id,
    )
    return doc_to_dict(db[Collections.POS_MACHINES].find_one({"_id": machine_id}))


# ─── POS Transactions ─────────────────────────────────────────────────────────

@router.get("/machines/{machine_id}/transactions", response_model=PaginatedResponse[PosTransactionResponse])
async def list_pos_transactions(
    machine_id:   str,
    page:         int        = Query(1, ge=1),
    page_size:    int        = Query(50, ge=1, le=200),
    sort_by:      str        = Query("transaction_date"),
    sort_dir:     str        = Query("desc"),
    is_settled:   str | None = Query(None),
    current_user: dict       = Depends(get_current_user),
):
    db = get_db()
    if not db[Collections.POS_MACHINES].find_one({"_id": machine_id}):
        raise HTTPException(status_code=404, detail="POS machine not found")

    query: dict = {"pos_machine_id": machine_id}
    if is_settled is not None and is_settled != "":
        query["is_settled"] = is_settled.lower() == "true"

    sort_field = sort_by if sort_by in TRANSACTION_SORT_FIELDS else "transaction_date"
    sort_order = ASCENDING if sort_dir == "asc" else DESCENDING

    total    = db[Collections.POS_TRANSACTIONS].count_documents(query)
    skip     = (page - 1) * page_size
    raw_docs = db[Collections.POS_TRANSACTIONS].find(query).sort(sort_field, sort_order).skip(skip).limit(page_size)

    return {
        "data":        [doc_to_dict(d) for d in raw_docs],
        "total":       total,
        "page":        page,
        "page_size":   page_size,
        "total_pages": math.ceil(total / page_size) if total > 0 else 1,
    }


@router.post("/machines/{machine_id}/transactions", response_model=PosTransactionResponse, status_code=201)
async def add_pos_transaction(
    machine_id:   str,
    payload:      PosTransactionCreate,
    current_user: dict = Depends(get_current_user),
):
    db          = get_db()
    machine_doc = db[Collections.POS_MACHINES].find_one({"_id": machine_id})
    if not machine_doc:
        raise HTTPException(status_code=404, detail="POS machine not found")
    if not machine_doc.get("is_active", False):
        raise HTTPException(status_code=400, detail="POS machine is inactive")

    now    = datetime.now(timezone.utc).isoformat()
    doc_id = new_id()
    doc    = {
        "_id":              doc_id,
        "pos_machine_id":   machine_id,
        "bank_account_id":  machine_doc["bank_account_id"],
        "branch_id":        machine_doc["branch_id"],
        "amount":           payload.amount,
        "card_type":        payload.card_type,
        "reference_number": payload.reference_number,
        "transaction_date": payload.transaction_date,
        "is_settled":       False,
        "settlement_id":    None,
        "notes":            payload.notes,
        "created_at":       now,
        **audit_create_fields(current_user),
    }
    db[Collections.POS_TRANSACTIONS].insert_one(doc)
    db[Collections.POS_MACHINES].update_one(
        {"_id": machine_id},
        {"$inc": {"unsettled_amount": payload.amount}, "$set": {"updated_at": now}},
    )
    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="CREATE",
        resource="pos_transaction", resource_id=doc_id,
    )
    return doc_to_dict(doc)


# ─── Settlements ──────────────────────────────────────────────────────────────

@router.get("/machines/{machine_id}/settlements", response_model=PaginatedResponse[PosSettlementResponse])
async def list_pos_settlements(
    machine_id:   str,
    page:         int  = Query(1, ge=1),
    page_size:    int  = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    db = get_db()
    if not db[Collections.POS_MACHINES].find_one({"_id": machine_id}):
        raise HTTPException(status_code=404, detail="POS machine not found")

    query  = {"pos_machine_id": machine_id}
    total  = db[Collections.POS_SETTLEMENTS].count_documents(query)
    skip   = (page - 1) * page_size
    docs   = (
        db[Collections.POS_SETTLEMENTS]
        .find(query)
        .sort("created_at", DESCENDING)
        .skip(skip)
        .limit(page_size)
    )
    return {
        "data":        [doc_to_dict(d) for d in docs],
        "total":       total,
        "page":        page,
        "page_size":   page_size,
        "total_pages": math.ceil(total / page_size) if total > 0 else 1,
    }


@router.post("/machines/{machine_id}/settle", response_model=PosSettlementResponse)
async def settle_pos_machine(
    machine_id:   str,
    payload:      PosSettleRequest,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db          = get_db()
    machine_doc = db[Collections.POS_MACHINES].find_one({"_id": machine_id})
    if not machine_doc:
        raise HTTPException(status_code=404, detail="POS machine not found")
    if not machine_doc.get("is_active", False):
        raise HTTPException(status_code=400, detail="Cannot settle an inactive POS machine")

    unsettled_txns = list(db[Collections.POS_TRANSACTIONS].find({
        "pos_machine_id": machine_id,
        "is_settled":     False,
    }))
    if not unsettled_txns:
        raise HTTPException(status_code=400, detail="No unsettled transactions to settle")

    total_amount      = sum(t["amount"] for t in unsettled_txns)
    transaction_count = len(unsettled_txns)
    bank_account_id   = machine_doc["bank_account_id"]

    account_doc = db[Collections.BANK_ACCOUNTS].find_one({"_id": bank_account_id})
    if not account_doc:
        raise HTTPException(status_code=404, detail="Linked bank account not found")

    now            = datetime.now(timezone.utc).isoformat()
    settlement_id  = new_id()
    balance_before = account_doc.get("current_balance", 0.0)
    balance_after  = balance_before + total_amount

    settlement_doc = {
        "_id":               settlement_id,
        "pos_machine_id":    machine_id,
        "bank_account_id":   bank_account_id,
        "bank_account_name": account_doc.get("account_name", ""),
        "branch_id":         machine_doc["branch_id"],
        "total_amount":      total_amount,
        "transaction_count": transaction_count,
        "settlement_date":   payload.settlement_date,
        "notes":             payload.notes,
        "created_at":        now,
        **audit_create_fields(current_user),
    }
    db[Collections.POS_SETTLEMENTS].insert_one(settlement_doc)

    txn_ids = [t["_id"] for t in unsettled_txns]
    db[Collections.POS_TRANSACTIONS].update_many(
        {"_id": {"$in": txn_ids}},
        {"$set": {"is_settled": True, "settlement_id": settlement_id}},
    )

    db[Collections.BANK_ACCOUNTS].update_one(
        {"_id": bank_account_id},
        {"$set": {"current_balance": balance_after, "updated_at": now}},
    )
    db[Collections.BANK_ACCOUNT_TRANSACTIONS].insert_one({
        "_id":            new_id(),
        "account_id":     bank_account_id,
        "account_name":   account_doc.get("account_name", ""),
        "branch_id":      machine_doc["branch_id"],
        "type":           "DEPOSIT",
        "amount":         total_amount,
        "balance_before": balance_before,
        "balance_after":  balance_after,
        "notes":          f"POS settlement — TID {machine_doc['terminal_id']} — {transaction_count} transaction(s)",
        "reference_id":   settlement_id,
        "created_at":     now,
        **audit_create_fields(current_user),
    })

    db[Collections.POS_MACHINES].update_one(
        {"_id": machine_id},
        {"$set": {"unsettled_amount": 0.0, "last_settled_at": now, "updated_at": now}},
    )

    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="SETTLE",
        resource="pos_machine", resource_id=machine_id,
    )
    return doc_to_dict(settlement_doc)
