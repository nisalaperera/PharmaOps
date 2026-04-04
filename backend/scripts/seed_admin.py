import sys, os
sys.path.append(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"))

from dotenv import load_dotenv
load_dotenv()

from app.core.database import get_db, Collections, new_id
from app.utils.password import hash_password
from datetime import datetime, timezone

db     = get_db()
now    = datetime.now(timezone.utc).isoformat()
doc_id = new_id()

admin_user = {
    "_id":           doc_id,
    "email":         "admin@mediguide.lk",
    "full_name":     "System Admin",
    "role":          "ADMIN",
    "branch_id":     None,
    "status":        "ACTIVE",
    "phone":         "0771234567",
    "password_hash": hash_password("password123"),
    "created_at":    now,
    "updated_at":    now,
}

db[Collections.USERS].insert_one(admin_user)
print(f"Admin user created with ID: {doc_id}")
print(f"Email:    admin@mediguide.lk")
print(f"Password: password123  <- Change this immediately after first login!")
