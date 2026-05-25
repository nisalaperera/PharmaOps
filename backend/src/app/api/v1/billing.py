from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, timezone
from app.core.database import get_db, Collections, new_id, doc_to_dict
from app.middleware.auth_middleware import get_current_user
from app.middleware.audit_middleware import log_audit
from app.utils.audit import audit_create_fields
from app.models.billing import CreditPaymentCreate, CreditPaymentResponse
from app.models.common import PaginatedResponse

router = APIRouter(prefix="/billing", tags=["Billing"])

BRANCH_LEVEL_ROLES = {"BRANCH_ADMIN", "BRANCH_MANAGER", "BRANCH_USER"}


def _apply_branch_scope(flt: dict, current_user: dict, branch_id: str | None) -> None:
    if current_user["role"] in BRANCH_LEVEL_ROLES:
        flt["branch_id"] = current_user["branch_id"]
    elif branch_id:
        flt["branch_id"] = branch_id


@router.get("/payments", response_model=PaginatedResponse[CreditPaymentResponse])
async def list_credit_payments(
    branch_id:   str | None = Query(default=None),
    customer_id: str | None = Query(default=None),
    page:        int        = Query(default=1, ge=1),
    page_size:   int        = Query(default=20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    db  = get_db()
    flt: dict = {}
    _apply_branch_scope(flt, current_user, branch_id)
    if customer_id:
        flt["customer_id"] = customer_id

    total = db[Collections.BILLING_PAYMENTS].count_documents(flt)
    skip  = (page - 1) * page_size
    docs  = db[Collections.BILLING_PAYMENTS].find(flt).sort("created_at", -1).skip(skip).limit(page_size)

    return PaginatedResponse[CreditPaymentResponse](
        data=[CreditPaymentResponse(**doc_to_dict(d)) for d in docs],
        total=total, page=page, page_size=page_size,
        total_pages=max(1, -(-total // page_size)),
    )


@router.post("/payments", response_model=CreditPaymentResponse, status_code=201)
async def record_credit_payment(
    payload:      CreditPaymentCreate,
    current_user: dict = Depends(get_current_user),
):
    db       = get_db()
    customer = db[Collections.CUSTOMERS].find_one({"_id": payload.customer_id})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    outstanding = customer.get("outstanding_balance", 0)
    if payload.amount > outstanding + 0.001:  # small float tolerance
        raise HTTPException(
            status_code=400,
            detail=f"Payment amount exceeds outstanding balance of {outstanding:.2f}",
        )

    now    = datetime.now(timezone.utc).isoformat()
    doc_id = new_id()

    payment_data = {
        "_id":          doc_id,
        **payload.model_dump(),
        "customer_name": customer.get("full_name", ""),
        "cashier_id":   current_user["id"],
        "cashier_name": current_user.get("full_name", ""),
        "created_at":   now,
        "updated_at":   now,
        **audit_create_fields(current_user),
    }
    db[Collections.BILLING_PAYMENTS].insert_one(payment_data)

    db[Collections.CUSTOMERS].update_one(
        {"_id": payload.customer_id},
        {"$inc": {"outstanding_balance": -payload.amount}}
    )

    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="CREATE",
        resource="credit_payment", resource_id=doc_id,
    )

    return CreditPaymentResponse(**doc_to_dict(payment_data))
