"""
Migration: Supplier model v1 → v2

Changes applied:
  1. supplier_type = "DISTRIBUTOR" (all existing suppliers were procurement-oriented)
  2. name → short_name and legal_name (copies old name to both fields)
  3. channels (old single-contact model) → distributor_channels (new multi-contact model)
     - Existing channel's contact_person_name / phone / email / address are preserved
       as a single ChannelContact entry (type: SALES)
  4. credit_term_days moves from supplier level into each distributor channel
  5. agency_channels: [] added (empty for all existing suppliers)

Run from the backend/ directory:
    python scripts/migrate_suppliers.py
"""

import os, sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from pymongo import MongoClient
from app.core.config import settings

client = MongoClient(settings.MONGODB_URL)
db     = client[settings.DATABASE_NAME]


def migrate():
    collection = db["suppliers"]
    docs       = list(collection.find({}))
    migrated   = 0
    skipped    = 0

    for doc in docs:
        if "supplier_type" in doc:
            skipped += 1
            continue

        old_name          = doc.get("name", "")
        old_credit_term   = doc.get("credit_term_days", 30)
        old_channels      = doc.get("channels", [])

        new_distributor_channels = []
        for ch in old_channels:
            contact = {
                "title":        "Mr.",
                "first_name":   ch.get("contact_person_name", ""),
                "last_name":    "",
                "landline":     None,
                "mobile":       ch.get("phone", ""),
                "whatsapp":     None,
                "contact_type": "SALES",
            }
            new_channel = {
                "id":                ch.get("id") or ch.get("_id"),
                "channel_name":      ch.get("channel_name", ""),
                "channel_category":  "SUB",
                "agency_id":         None,
                "agency_name":       None,
                "credit_term_days":  old_credit_term,
                "delivery_frequency": "AS_NEEDED",
                "contacts":          [contact],
                "product_mappings":  [],
            }
            new_distributor_channels.append(new_channel)

        update = {
            "supplier_type":        "DISTRIBUTOR",
            "short_name":           old_name,
            "legal_name":           old_name,
            "agency_channels":      [],
            "distributor_channels": new_distributor_channels,
        }

        collection.update_one(
            {"_id": doc["_id"]},
            {
                "$set":   update,
                "$unset": {"name": "", "channels": "", "credit_term_days": ""},
            },
        )
        migrated += 1

    print(f"Migration complete: {migrated} migrated, {skipped} already migrated (skipped).")


if __name__ == "__main__":
    migrate()
