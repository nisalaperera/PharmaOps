from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, timezone
from app.core.database import get_db, Collections, new_id, doc_to_dict
from app.middleware.auth_middleware import require_min_role, get_current_user
from app.middleware.audit_middleware import log_audit
from app.utils.audit import audit_create_fields, audit_update_fields
from app.models.rep_visit import RepVisitCreate, RepVisitUpdate, RepVisitResponse
from app.models.common import PaginatedResponse

router = APIRouter(prefix="/rep-visits", tags=["Rep Visits"])


def _resolve_names(db, doc: dict) -> dict:
    d = doc_to_dict(doc) if "_id" in doc else dict(doc)
    supplier = db[Collections.SUPPLIERS].find_one({"_id": d.get("supplier_id")}, {"name": 1, "short_name": 1})
    if supplier:
        d["supplier_name"] = supplier.get("name", supplier.get("short_name", ""))

    if d.get("supplier_id") and d.get("channel_id"):
        sup = db[Collections.SUPPLIERS].find_one({"_id": d["supplier_id"]})
        if sup:
            for ch_list in ("agency_channels", "distributor_channels"):
                for ch in sup.get(ch_list, []):
                    if ch.get("id") == d["channel_id"]:
                        d["channel_name"] = ch.get("channel_name", "")
                        break
    return d


@router.get("", response_model=PaginatedResponse[RepVisitResponse])
async def list_rep_visits(
    supplier_id: str | None = Query(default=None),
    channel_id:  str | None = Query(default=None),
    page:        int = Query(default=1, ge=1),
    page_size:   int = Query(default=20, ge=1, le=100),
    sort_dir:    str | None = Query(default="desc"),
    current_user: dict = Depends(get_current_user),
):
    db  = get_db()
    flt: dict = {}
    if supplier_id:
        flt["supplier_id"] = supplier_id
    if channel_id:
        flt["channel_id"] = channel_id

    sort_order = 1 if sort_dir == "asc" else -1
    total = db[Collections.REP_VISITS].count_documents(flt)
    skip  = (page - 1) * page_size
    docs  = db[Collections.REP_VISITS].find(flt).sort("visit_date", sort_order).skip(skip).limit(page_size)
    items = [RepVisitResponse(**_resolve_names(db, d)) for d in docs]

    return PaginatedResponse[RepVisitResponse](
        data=items, total=total, page=page,
        page_size=page_size, total_pages=max(1, -(-total // page_size)),
    )


@router.post("", response_model=RepVisitResponse, status_code=201)
async def create_rep_visit(
    payload:      RepVisitCreate,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db  = get_db()
    now = datetime.now(timezone.utc).isoformat()
    doc_id = new_id()

    data = {
        "_id": doc_id,
        **payload.model_dump(),
        "created_at": now,
        "updated_at": now,
        **audit_create_fields(current_user),
    }
    db[Collections.REP_VISITS].insert_one(data)

    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="CREATE",
        resource="rep_visit", resource_id=doc_id,
    )
    return RepVisitResponse(**_resolve_names(db, data))


@router.get("/{visit_id}", response_model=RepVisitResponse)
async def get_rep_visit(
    visit_id:     str,
    current_user: dict = Depends(get_current_user),
):
    db  = get_db()
    doc = db[Collections.REP_VISITS].find_one({"_id": visit_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Rep visit not found")
    return RepVisitResponse(**_resolve_names(db, doc))


@router.patch("/{visit_id}", response_model=RepVisitResponse)
async def update_rep_visit(
    visit_id:     str,
    payload:      RepVisitUpdate,
    current_user: dict = Depends(require_min_role("BRANCH_MANAGER")),
):
    db  = get_db()
    doc = db[Collections.REP_VISITS].find_one({"_id": visit_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Rep visit not found")

    updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    updates.update(audit_update_fields(current_user))
    db[Collections.REP_VISITS].update_one({"_id": visit_id}, {"$set": updates})

    await log_audit(
        user_id=current_user["id"], user_email=current_user["email"],
        user_role=current_user["role"], action="UPDATE",
        resource="rep_visit", resource_id=visit_id,
    )
    return RepVisitResponse(**_resolve_names(db, db[Collections.REP_VISITS].find_one({"_id": visit_id})))
