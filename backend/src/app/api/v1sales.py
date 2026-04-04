from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, timezone
from app.database import get_db, Collections, new_id, doc_to_dict
from app.middleware.auth_middleware import get_current_user
from app.models.sale import SaleCreate, SaleResponse
from app.models.common import PaginatedResponse

router = APIRouter(prefix="/sales", tags=["Sales"])


@router.get("", response_model=PaginatedResponse[SaleResponse])
async def list_sales(
    branch_id:  str | None = Query(default=None),
    patient_id: str | None = Query(default=None),
    page:       int = Query(default=1, ge=1),
    page_size:  int = Query(default=20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    db     = get_db()
    filter = {}

    effective_branch = (
        current_user["branch_id"]
        if current_user["role"] in ("BRANCH_ADMIN", "BRANCH_MANAGER", "BRANCH_USER")
        else branch_id
    )
    if effective_branch: filter["branch_id"]  = effective_branch
    if patient_id:       filter["patient_id"] = patient_id

    total = db[Collections.SALES].count_documents(filter)
    skip  = (page - 1) * page_size
    docs  = db[Collections.SALES].find(filter).sort("created_at", -1).skip(skip).limit(page_size)
    sales = [SaleResponse(**doc_to_dict(d)) for d in docs]

    return PaginatedResponse[SaleResponse](
        data=sales, total=total, page=page,
        page_size=page_size, total_pages=max(1, -(-total // page_size)),
    )


@router.post("", response_model=SaleResponse, status_code=201)
async def create_sale(payload: SaleCreate, current_user: dict = Depends(get_current_user)):
    db  = get_db()
    now = datetime.now(timezone.utc).isoformat()

    items_data     = []
    subtotal       = 0.0
    discount_total = 0.0

    for item in payload.items:
        item_total      = (item.unit_price * item.quantity) - item.discount
        subtotal       += item.unit_price * item.quantity
        discount_total += item.discount
        items_data.append({**item.model_dump(), "total_price": item_total})

    total_amount  = subtotal - discount_total
    change_amount = max(0, payload.paid_amount - total_amount)
    doc_id        = new_id()

    sale_data = {
        "_id":           doc_id,
        **payload.model_dump(exclude={"items"}),
        "items":          items_data,
        "subtotal":       subtotal,
        "discount_total": discount_total,
        "total_amount":   total_amount,
        "change_amount":  change_amount,
        "status":         "COMPLETED",
        "cashier_id":     current_user["id"],
        "cashier_name":   current_user.get("full_name", ""),
        "created_at":     now,
        "updated_at":     now,
    }
    db[Collections.SALES].insert_one(sale_data)
    return SaleResponse(**doc_to_dict(sale_data))


@router.get("/{sale_id}", response_model=SaleResponse)
async def get_sale(sale_id: str, current_user: dict = Depends(get_current_user)):
    db  = get_db()
    doc = db[Collections.SALES].find_one({"_id": sale_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Sale not found")
    return SaleResponse(**doc_to_dict(doc))
