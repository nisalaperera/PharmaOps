import math
from fastapi          import APIRouter, HTTPException, Depends, Query
from datetime         import datetime, timezone
from pymongo          import ASCENDING, DESCENDING
from app.core.database import get_db, Collections, new_id, doc_to_dict, build_search_filter
from app.middleware.auth_middleware  import get_current_user, require_min_role
from app.middleware.audit_middleware import log_audit
from app.utils.audit  import audit_create_fields, audit_update_fields
from app.models.cheque import (
    ChequeBookCreate, ChequeBookUpdate, ChequeBookResponse,
    ChequeIssueCreate, ChequeIssueStatusUpdate, ChequeIssueResponse,
)
from app.models.common import PaginatedResponse

router = APIRouter(prefix="/treasury/bank-accounts/cheques", tags=["Treasury"])

BOOK_SORT_FIELDS  = {"series_name", "created_at", "start_number"}
ISSUE_SORT_FIELDS = {"cheque_number", "issue_date", "amount", "created_at"}


# ─── Internal helpers ─────────────────────────────────────────────────────────

def _enrich_book(doc: dict) -> dict:
    doc["total_leaves"] = doc["end_number"] - doc["start_number"] + 1
    return doc


# ─── Cheque Books ─────────────────────────────────────────────────────────────

@router.get("/books", response_model=PaginatedResponse[ChequeBookResponse])
async def list_cheque_books(
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
        search_filter = build_search_filter(search, ["series_name", "bank_account_name", "bank_name", "branch_name"])
        if search_filter:
            query.update(search_filter)

    sort_field = sort_by if sort_by in BOOK_SORT_FIELDS else "created_at"
    sort_order = ASCENDING if sort_dir == "asc" else DESCENDING

    total    = db[Collections.CHEQUE_BOOKS].count_documents(query)
    skip     = (page - 1) * page_size
    raw_docs = db[Collections.CHEQUE_BOOKS].find(query).sort(sort_field, sort_order).skip(skip).limit(page_size)
    books    = [_enrich_book(doc_to_dict(doc)) for doc in raw_docs]

    return {
        "data":        books,
        "total":       total,
        "page":        page,
        "page_size":   page_size,
        "total_pages": math.ceil(total / page_size) if total > 0 else 1,
    }


@router.post("/books", response_model=ChequeBookResponse, status_code=201)
async def create_cheque_book(
    payload:      ChequeBookCreate,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db = get_db()

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
        "_id":             doc_id,
        "bank_account_id": payload.bank_account_id,
        "bank_account_name": account_doc.get("account_name", ""),
        "bank_name":       account_doc.get("bank_name", ""),
        "branch_id":       account_doc["branch_id"],
        "branch_name":     branch_name,
        "series_name":     payload.series_name,
        "start_number":    payload.start_number,
        "end_number":      payload.end_number,
        "used_leaves":     0,
        "is_active":       True,
        "notes":           payload.notes,
        "created_at":      now,
        "updated_at":      now,
        **audit_create_fields(current_user),
    }
    db[Collections.CHEQUE_BOOKS].insert_one(doc)
    log_audit(db, current_user, "CREATE", "cheque_book", doc_id)
    return _enrich_book(doc_to_dict(doc))


@router.patch("/books/{book_id}", response_model=ChequeBookResponse)
async def update_cheque_book(
    book_id:      str,
    payload:      ChequeBookUpdate,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db  = get_db()
    doc = db[Collections.CHEQUE_BOOKS].find_one({"_id": book_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Cheque book not found")

    updates = payload.model_dump(exclude_none=True)
    if not updates:
        return _enrich_book(doc_to_dict(doc))

    now = datetime.now(timezone.utc).isoformat()
    updates["updated_at"] = now
    updates.update(audit_update_fields(current_user))

    db[Collections.CHEQUE_BOOKS].update_one({"_id": book_id}, {"$set": updates})
    log_audit(db, current_user, "UPDATE", "cheque_book", book_id)
    updated = db[Collections.CHEQUE_BOOKS].find_one({"_id": book_id})
    return _enrich_book(doc_to_dict(updated))


# ─── Cheque Issues ────────────────────────────────────────────────────────────

@router.get("/books/{book_id}/issues", response_model=PaginatedResponse[ChequeIssueResponse])
async def list_cheque_issues(
    book_id:      str,
    page:         int        = Query(1, ge=1),
    page_size:    int        = Query(50, ge=1, le=200),
    sort_by:      str        = Query("cheque_number"),
    sort_dir:     str        = Query("asc"),
    status:       str | None = Query(None),
    current_user: dict       = Depends(get_current_user),
):
    db = get_db()

    if not db[Collections.CHEQUE_BOOKS].find_one({"_id": book_id}):
        raise HTTPException(status_code=404, detail="Cheque book not found")

    query: dict = {"cheque_book_id": book_id}
    if status:
        query["status"] = status

    sort_field = sort_by if sort_by in ISSUE_SORT_FIELDS else "cheque_number"
    sort_order = ASCENDING if sort_dir == "asc" else DESCENDING

    total    = db[Collections.CHEQUE_ISSUES].count_documents(query)
    skip     = (page - 1) * page_size
    raw_docs = db[Collections.CHEQUE_ISSUES].find(query).sort(sort_field, sort_order).skip(skip).limit(page_size)

    return {
        "data":        [doc_to_dict(d) for d in raw_docs],
        "total":       total,
        "page":        page,
        "page_size":   page_size,
        "total_pages": math.ceil(total / page_size) if total > 0 else 1,
    }


@router.post("/books/{book_id}/issues", response_model=ChequeIssueResponse, status_code=201)
async def create_cheque_issue(
    book_id:      str,
    payload:      ChequeIssueCreate,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db = get_db()

    book_doc = db[Collections.CHEQUE_BOOKS].find_one({"_id": book_id})
    if not book_doc:
        raise HTTPException(status_code=404, detail="Cheque book not found")
    if not book_doc.get("is_active", False):
        raise HTTPException(status_code=400, detail="Cheque book is inactive")

    start_num = book_doc["start_number"]
    end_num   = book_doc["end_number"]
    used      = book_doc.get("used_leaves", 0)
    total     = end_num - start_num + 1

    if payload.cheque_number < start_num or payload.cheque_number > end_num:
        raise HTTPException(
            status_code=400,
            detail=f"Cheque number must be between {start_num} and {end_num}",
        )

    if used >= total:
        raise HTTPException(status_code=400, detail="All leaves in this cheque book have been used")

    if db[Collections.CHEQUE_ISSUES].find_one({"cheque_book_id": book_id, "cheque_number": payload.cheque_number}):
        raise HTTPException(status_code=400, detail=f"Cheque #{payload.cheque_number} is already issued in this book")

    now    = datetime.now(timezone.utc).isoformat()
    doc_id = new_id()
    doc    = {
        "_id":            doc_id,
        "cheque_book_id": book_id,
        "bank_account_id": book_doc["bank_account_id"],
        "cheque_number":  payload.cheque_number,
        "payee":          payload.payee,
        "amount":         payload.amount,
        "issue_date":     payload.issue_date,
        "purpose":        payload.purpose,
        "status":         "ISSUED",
        "notes":          payload.notes,
        "created_at":     now,
        "updated_at":     now,
        **audit_create_fields(current_user),
    }
    db[Collections.CHEQUE_ISSUES].insert_one(doc)
    db[Collections.CHEQUE_BOOKS].update_one(
        {"_id": book_id},
        {"$inc": {"used_leaves": 1}, "$set": {"updated_at": now}},
    )
    log_audit(db, current_user, "CREATE", "cheque_issue", doc_id)
    return doc_to_dict(doc)


@router.patch("/books/{book_id}/issues/{issue_id}/status", response_model=ChequeIssueResponse)
async def update_cheque_issue_status(
    book_id:      str,
    issue_id:     str,
    payload:      ChequeIssueStatusUpdate,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db = get_db()

    if not db[Collections.CHEQUE_BOOKS].find_one({"_id": book_id}):
        raise HTTPException(status_code=404, detail="Cheque book not found")

    issue_doc = db[Collections.CHEQUE_ISSUES].find_one({"_id": issue_id, "cheque_book_id": book_id})
    if not issue_doc:
        raise HTTPException(status_code=404, detail="Cheque issue not found")

    if issue_doc.get("status") != "ISSUED":
        raise HTTPException(
            status_code=400,
            detail=f"Only ISSUED cheques can be updated. Current status: {issue_doc.get('status')}",
        )

    now = datetime.now(timezone.utc).isoformat()

    if payload.status == "CLEARED":
        account_id  = issue_doc["bank_account_id"]
        account_doc = db[Collections.BANK_ACCOUNTS].find_one({"_id": account_id})
        if not account_doc:
            raise HTTPException(status_code=404, detail="Bank account not found")

        amount          = issue_doc["amount"]
        current_balance = account_doc.get("current_balance", 0)
        if current_balance < amount:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient balance. Available: {current_balance:.2f}, Cheque amount: {amount:.2f}",
            )

        new_balance = current_balance - amount
        db[Collections.BANK_ACCOUNTS].update_one(
            {"_id": account_id},
            {"$set": {"current_balance": new_balance, "updated_at": now}},
        )
        db[Collections.BANK_ACCOUNT_TRANSACTIONS].insert_one({
            "_id":            new_id(),
            "account_id":     account_id,
            "type":           "WITHDRAWAL",
            "amount":         amount,
            "balance_before": current_balance,
            "balance_after":  new_balance,
            "notes":          f"Cheque #{issue_doc['cheque_number']} cleared — {issue_doc.get('payee', '')}",
            "reference_id":   issue_id,
            "created_at":     now,
            **audit_create_fields(current_user),
        })

    updates: dict = {
        "status":            payload.status,
        "status_updated_at": now,
        "updated_at":        now,
        **audit_update_fields(current_user),
    }
    if payload.notes:
        updates["notes"] = payload.notes

    db[Collections.CHEQUE_ISSUES].update_one({"_id": issue_id}, {"$set": updates})
    log_audit(db, current_user, "UPDATE", "cheque_issue", issue_id)
    updated = db[Collections.CHEQUE_ISSUES].find_one({"_id": issue_id})
    return doc_to_dict(updated)
