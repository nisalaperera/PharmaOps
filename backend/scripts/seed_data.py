"""
Seed sample data for PharmaOps:
  - SKUs, Generics, Brands, Categories
  - Products (100)
  - Suppliers (5)
  - Customers (20) + Patients (20)
  - Doctors (10)
  - Purchase Orders (10) + GRNs (10)
  - Inventory (auto-created per product)
  - Sales (10)
  - Prescriptions (10)
  - Cash Registries (2)
  - Bank Accounts (2)
  - POS Machines (2)
  - Cheque Books (2)

Run from backend/ root:
  Windows:  $env:PYTHONPATH="src"; python scripts/seed_data.py
  Linux:    PYTHONPATH=src python scripts/seed_data.py
"""

import sys, os
sys.path.append(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src"))

from dotenv import load_dotenv
load_dotenv()

from app.core.database import get_db, Collections, new_id
from datetime import datetime, timezone, timedelta
import random

db  = get_db()
now = datetime.now(timezone.utc)


# ── Helpers ───────────────────────────────────────────────────────────────────

def ts(dt=None):
    return (dt or now).isoformat()

def past(days, fmt="%Y-%m-%d"):
    return (now - timedelta(days=days)).strftime(fmt)

def future(days, fmt="%Y-%m-%d"):
    return (now + timedelta(days=days)).strftime(fmt)

def insert_if_empty(collection_name, docs, label):
    if db[collection_name].count_documents({}) > 0:
        print(f"  SKIP  {label} (already has data)")
        return list(db[collection_name].find({}))
    db[collection_name].insert_many(docs)
    print(f"  OK    {label} — {len(docs)} records inserted")
    return docs


# ── Prerequisites ─────────────────────────────────────────────────────────────

admin_user = db[Collections.USERS].find_one({"role": "ADMIN"})
if not admin_user:
    print("ERROR: No admin user found. Run seed_admin.py first.")
    sys.exit(1)

admin_id   = str(admin_user["_id"])
admin_name = admin_user["full_name"]

branches = list(db[Collections.BRANCHES].find({}))
if not branches:
    print("ERROR: No branches found. Create at least one branch via the UI first.")
    sys.exit(1)

branch    = branches[0]
branch_id = str(branch["_id"])
branch_name = branch.get("name", "Main Branch")

print(f"\nSeeding data for branch: {branch_name} ({branch_id})")
print(f"Using admin:            {admin_name} ({admin_id})\n")


# ── 1. SKUs ───────────────────────────────────────────────────────────────────

sku_definitions = [
    ("Tablet",  "Tablets",  "COUNT"),
    ("Capsule", "Capsules", "COUNT"),
    ("Vial",    "Vials",    "COUNT"),
    ("Sachet",  "Sachets",  "COUNT"),
    ("Bottle",  "Bottles",  "COUNT"),
    ("Strip",   "Strips",   "COUNT"),
    ("mL",      "mL",       "VOLUME"),
    ("L",       "L",        "VOLUME"),
    ("mg",      "mg",       "WEIGHT"),
    ("g",       "g",        "WEIGHT"),
]

sku_docs = []
for name, plural, sku_type in sku_definitions:
    sku_docs.append({
        "_id":        new_id(),
        "name":       name,
        "plural":     plural,
        "sku_type":   sku_type,
        "is_active":  True,
        "created_at": ts(),
        "updated_at": ts(),
    })

sku_docs = insert_if_empty(Collections.SKUS, sku_docs, "SKUs")
sku_map  = {d["name"]: str(d["_id"]) for d in sku_docs}


# ── 2. Generics ───────────────────────────────────────────────────────────────

generic_names = [
    "Paracetamol", "Amoxicillin", "Ibuprofen", "Metformin", "Atorvastatin",
    "Omeprazole", "Amlodipine", "Losartan", "Cetirizine", "Azithromycin",
    "Ciprofloxacin", "Metronidazole", "Doxycycline", "Prednisolone", "Salbutamol",
    "Ranitidine", "Diclofenac", "Aspirin", "Clopidogrel", "Pantoprazole",
    "Folic Acid", "Vitamin C", "Zinc Sulfate", "Calcium Carbonate", "Vitamin D3",
]

generic_docs = []
for gname in generic_names:
    generic_docs.append({
        "_id":         new_id(),
        "name":        gname,
        "description": f"{gname} generic drug",
        "is_active":   True,
        "created_at":  ts(),
        "updated_at":  ts(),
    })

generic_docs = insert_if_empty(Collections.GENERICS, generic_docs, "Generics")
generic_ids  = [str(d["_id"]) for d in generic_docs]
generic_map  = {str(d["_id"]): d["name"] for d in generic_docs}


# ── 3. Brands ─────────────────────────────────────────────────────────────────

brand_data = [
    ("Panadol",     "GSK Consumer Healthcare"),
    ("Brufen",      "Abbott Laboratories"),
    ("Augmentin",   "GSK"),
    ("Glucophage",  "Merck KGaA"),
    ("Lipitor",     "Pfizer"),
    ("Losec",       "AstraZeneca"),
    ("Norvasc",     "Pfizer"),
    ("Cozaar",      "Merck & Co"),
    ("Zyrtec",      "Johnson & Johnson"),
    ("Zithromax",   "Pfizer"),
    ("Cifran",      "Ranbaxy"),
    ("Flagyl",      "Pfizer"),
    ("Vibramycin",  "Pfizer"),
    ("Deltasone",   "Pfizer"),
    ("Ventolin",    "GSK"),
    ("Zantac",      "GSK"),
    ("Voltaren",    "Novartis"),
    ("Disprin",     "Reckitt Benckiser"),
    ("Plavix",      "Bristol-Myers Squibb"),
    ("Pantocid",    "Sun Pharma"),
]

brand_docs = []
for bname, manufacturer in brand_data:
    brand_docs.append({
        "_id":               new_id(),
        "name":              bname,
        "manufacturer_name": manufacturer,
        "description":       f"Products by {manufacturer}",
        "is_active":         True,
        "created_at":        ts(),
        "updated_at":        ts(),
    })

brand_docs = insert_if_empty(Collections.BRANDS, brand_docs, "Brands")
brand_ids  = [str(d["_id"]) for d in brand_docs]
brand_map  = {str(d["_id"]): d["name"] for d in brand_docs}


# ── 4. Categories ─────────────────────────────────────────────────────────────

category_data = [
    ("Analgesics & Antipyretics", "Pain relief and fever reduction"),
    ("Antibiotics",               "Antibacterial medications"),
    ("Antidiabetics",             "Diabetes management drugs"),
    ("Cardiovascular",            "Heart and blood pressure medications"),
    ("Gastrointestinal",          "Digestive system medications"),
    ("Antihistamines",            "Allergy relief medications"),
    ("Vitamins & Supplements",    "Nutritional supplements"),
    ("Respiratory",               "Respiratory tract medications"),
    ("Anti-inflammatory",         "NSAIDs and corticosteroids"),
    ("Antiplatelet",              "Blood thinning agents"),
]

category_docs = []
for cname, cdesc in category_data:
    category_docs.append({
        "_id":         new_id(),
        "name":        cname,
        "description": cdesc,
        "parent_id":   None,
        "is_active":   True,
        "created_at":  ts(),
        "updated_at":  ts(),
    })

category_docs = insert_if_empty(Collections.CATEGORIES, category_docs, "Categories")
category_ids  = [str(d["_id"]) for d in category_docs]
category_map  = {str(d["_id"]): d["name"] for d in category_docs}


# ── 5. Products (100) ─────────────────────────────────────────────────────────

PRODUCT_TEMPLATES = [
    # (name_suffix, generic_idx, brand_idx, category_idx, sku_name, strengths)
    ("Paracetamol 500mg",   0,  0,  0, "Tablet",  ["500mg"]),
    ("Paracetamol 1000mg",  0,  0,  0, "Tablet",  ["1000mg"]),
    ("Paracetamol Syrup",   0,  0,  0, "mL",      ["120mg/5mL"]),
    ("Ibuprofen 200mg",     2,  1,  8, "Tablet",  ["200mg"]),
    ("Ibuprofen 400mg",     2,  1,  8, "Tablet",  ["400mg"]),
    ("Ibuprofen Gel",       2,  16, 8, "g",       ["5%"]),
    ("Amoxicillin 250mg",   1,  2,  1, "Capsule", ["250mg"]),
    ("Amoxicillin 500mg",   1,  2,  1, "Capsule", ["500mg"]),
    ("Amoxicillin 125mg/5mL",1, 2,  1, "mL",      ["125mg/5mL"]),
    ("Metformin 500mg",     3,  3,  2, "Tablet",  ["500mg"]),
    ("Metformin 850mg",     3,  3,  2, "Tablet",  ["850mg"]),
    ("Metformin 1000mg",    3,  3,  2, "Tablet",  ["1000mg"]),
    ("Atorvastatin 10mg",   4,  4,  3, "Tablet",  ["10mg"]),
    ("Atorvastatin 20mg",   4,  4,  3, "Tablet",  ["20mg"]),
    ("Atorvastatin 40mg",   4,  4,  3, "Tablet",  ["40mg"]),
    ("Omeprazole 20mg",     5,  5,  4, "Capsule", ["20mg"]),
    ("Omeprazole 40mg",     5,  5,  4, "Capsule", ["40mg"]),
    ("Amlodipine 5mg",      6,  6,  3, "Tablet",  ["5mg"]),
    ("Amlodipine 10mg",     6,  6,  3, "Tablet",  ["10mg"]),
    ("Losartan 25mg",       7,  7,  3, "Tablet",  ["25mg"]),
    ("Losartan 50mg",       7,  7,  3, "Tablet",  ["50mg"]),
    ("Losartan 100mg",      7,  7,  3, "Tablet",  ["100mg"]),
    ("Cetirizine 10mg",     8,  8,  5, "Tablet",  ["10mg"]),
    ("Cetirizine Syrup",    8,  8,  5, "mL",      ["5mg/5mL"]),
    ("Azithromycin 250mg",  9,  9,  1, "Tablet",  ["250mg"]),
    ("Azithromycin 500mg",  9,  9,  1, "Tablet",  ["500mg"]),
    ("Ciprofloxacin 250mg", 10, 10, 1, "Tablet",  ["250mg"]),
    ("Ciprofloxacin 500mg", 10, 10, 1, "Tablet",  ["500mg"]),
    ("Ciprofloxacin 750mg", 10, 10, 1, "Tablet",  ["750mg"]),
    ("Metronidazole 200mg", 11, 11, 1, "Tablet",  ["200mg"]),
    ("Metronidazole 400mg", 11, 11, 1, "Tablet",  ["400mg"]),
    ("Metronidazole Syrup", 11, 11, 4, "mL",      ["125mg/5mL"]),
    ("Doxycycline 100mg",   12, 12, 1, "Capsule", ["100mg"]),
    ("Prednisolone 5mg",    13, 13, 8, "Tablet",  ["5mg"]),
    ("Prednisolone 10mg",   13, 13, 8, "Tablet",  ["10mg"]),
    ("Prednisolone 25mg",   13, 13, 8, "Tablet",  ["25mg"]),
    ("Salbutamol Inhaler",  14, 14, 7, "Vial",    ["100mcg"]),
    ("Salbutamol Syrup",    14, 14, 7, "mL",      ["2mg/5mL"]),
    ("Ranitidine 150mg",    15, 15, 4, "Tablet",  ["150mg"]),
    ("Diclofenac 50mg",     16, 16, 8, "Tablet",  ["50mg"]),
    ("Diclofenac Gel",      16, 16, 8, "g",       ["1%"]),
    ("Aspirin 75mg",        17, 17, 9, "Tablet",  ["75mg"]),
    ("Aspirin 100mg",       17, 17, 9, "Tablet",  ["100mg"]),
    ("Aspirin 300mg",       17, 17, 9, "Tablet",  ["300mg"]),
    ("Clopidogrel 75mg",    18, 18, 9, "Tablet",  ["75mg"]),
    ("Pantoprazole 20mg",   19, 19, 4, "Tablet",  ["20mg"]),
    ("Pantoprazole 40mg",   19, 19, 4, "Tablet",  ["40mg"]),
    ("Folic Acid 5mg",      20, 0,  6, "Tablet",  ["5mg"]),
    ("Vitamin C 500mg",     21, 0,  6, "Tablet",  ["500mg"]),
    ("Vitamin C 1000mg",    21, 0,  6, "Tablet",  ["1000mg"]),
]

# Fill up to 100 with repeated variants
while len(PRODUCT_TEMPLATES) < 100:
    base = PRODUCT_TEMPLATES[len(PRODUCT_TEMPLATES) % len(PRODUCT_TEMPLATES[:50])]
    suffix_num = len(PRODUCT_TEMPLATES) + 1
    extended = (
        f"{base[0]} (Var {suffix_num})",
        base[1], base[2], base[3], base[4], base[5],
    )
    PRODUCT_TEMPLATES.append(extended)

product_docs = []
inventory_docs = []

for tpl in PRODUCT_TEMPLATES[:100]:
    pname, gen_idx, brand_idx, cat_idx, sku_name, _ = tpl

    generic_id   = generic_ids[gen_idx % len(generic_ids)]
    brand_id     = brand_ids[brand_idx % len(brand_ids)]
    category_id  = category_ids[cat_idx % len(category_ids)]
    basic_sku_id = sku_map.get(sku_name, sku_map["Tablet"])

    prod_id = new_id()
    product_docs.append({
        "_id":                  prod_id,
        "name":                 pname,
        "generic_id":           generic_id,
        "brand_id":             brand_id,
        "category_id":          category_id,
        "basic_sku_id":         basic_sku_id,
        "barcode":              f"BC{random.randint(1000000000, 9999999999)}",
        "specific_instructions": None,
        "sku_mappings":         [],
        "is_active":            True,
        "created_at":           ts(),
        "updated_at":           ts(),
    })

    # One inventory record per product
    batch_number  = f"BT{random.randint(10000, 99999)}"
    sup_docs_curr = list(db[Collections.SUPPLIERS].find({}, {"_id": 1, "name": 1}))
    sup_id        = str(sup_docs_curr[0]["_id"]) if sup_docs_curr else ""
    sup_name      = sup_docs_curr[0].get("name", "") if sup_docs_curr else ""

    inventory_docs.append({
        "_id":             new_id(),
        "branch_id":       branch_id,
        "product_id":      prod_id,
        "product_name":    pname,
        "batches": [{
            "batch_number":   batch_number,
            "expiry_date":    future(random.randint(180, 730)),
            "quantity":       random.randint(50, 500),
            "purchase_price": round(random.uniform(10, 200), 2),
            "selling_price":  round(random.uniform(15, 350), 2),
            "supplier_id":    sup_id,
            "supplier_name":  sup_name,
            "received_date":  past(random.randint(1, 60)),
        }],
        "total_quantity":  random.randint(50, 500),
        "min_stock_level": random.randint(10, 30),
        "is_low_stock":    False,
        "created_at":      ts(),
        "updated_at":      ts(),
    })

if db[Collections.PRODUCTS].count_documents({}) > 0:
    print("  SKIP  Products (already has data)")
    product_docs = list(db[Collections.PRODUCTS].find({}))
else:
    db[Collections.PRODUCTS].insert_many(product_docs)
    print(f"  OK    Products — {len(product_docs)} records inserted")

if db[Collections.INVENTORY].count_documents({}) > 0:
    print("  SKIP  Inventory (already has data)")
else:
    # Re-fetch so supplier IDs are correct
    sup_docs_all = list(db[Collections.SUPPLIERS].find({}, {"_id": 1, "name": 1}))
    sup_id_seed   = str(sup_docs_all[0]["_id"]) if sup_docs_all else ""
    sup_name_seed = sup_docs_all[0].get("name", "") if sup_docs_all else ""
    for inv in inventory_docs:
        if inv["batches"] and not inv["batches"][0]["supplier_id"]:
            inv["batches"][0]["supplier_id"]   = sup_id_seed
            inv["batches"][0]["supplier_name"] = sup_name_seed
    db[Collections.INVENTORY].insert_many(inventory_docs)
    print(f"  OK    Inventory — {len(inventory_docs)} records inserted")

prod_ids  = [str(d["_id"]) for d in product_docs]
prod_map  = {str(d["_id"]): d["name"] for d in product_docs}


# ── 6. Suppliers ──────────────────────────────────────────────────────────────

supplier_data = [
    ("MediSupply Lanka Pvt Ltd",  "REG-001", "011 234 5678"),
    ("PharmaDist Solutions",      "REG-002", "011 345 6789"),
    ("National Drug Co.",         "REG-003", "011 456 7890"),
    ("Ceylon Pharma Distributors","REG-004", "011 567 8901"),
    ("HealthLine Imports Ltd",    "REG-005", "011 678 9012"),
]

supplier_docs = []
for sname, reg_no, phone in supplier_data:
    sup_id = new_id()
    supplier_docs.append({
        "_id":                 sup_id,
        "name":                sname,
        "registration_number": reg_no,
        "channels": [{
            "id":                   new_id(),
            "channel_name":         "Main Channel",
            "contact_person_name":  "Sales Rep",
            "phone":                phone,
            "email":                f"sales@{sname.lower().replace(' ', '')}.lk",
            "address":              "Colombo, Sri Lanka",
        }],
        "expiry_alert_configs": [],
        "credit_term_days":    30,
        "is_active":           True,
        "created_at":          ts(),
        "updated_at":          ts(),
    })

supplier_docs = insert_if_empty(Collections.SUPPLIERS, supplier_docs, "Suppliers")
supplier_ids  = [str(d["_id"]) for d in supplier_docs]
channel_ids   = [str(d["channels"][0]["id"]) for d in supplier_docs]
channel_names = [d["channels"][0]["channel_name"] for d in supplier_docs]
supplier_map  = {str(d["_id"]): d["name"] for d in supplier_docs}


# ── 7. Customers ──────────────────────────────────────────────────────────────

customer_data = [
    ("Kamal Perera",       "071 123 4567", "kamal@example.com",   "1985-03-15"),
    ("Nimal Silva",        "072 234 5678", "nimal@example.com",   "1990-07-22"),
    ("Sunil Fernando",     "073 345 6789", "sunil@example.com",   "1978-11-05"),
    ("Dilani Jayawardena", "074 456 7890", "dilani@example.com",  "1995-02-28"),
    ("Priya Wickramasinghe","075 567 8901","priya@example.com",   "1988-06-14"),
    ("Roshan Kumara",      "076 678 9012", "roshan@example.com",  "1982-09-30"),
    ("Chamari Bandara",    "077 789 0123", "chamari@example.com", "1993-04-17"),
    ("Tharanga Rathnayake","078 890 1234", "tharanga@example.com","1975-12-03"),
    ("Malini Gunawardena", "079 901 2345", "malini@example.com",  "1998-08-21"),
    ("Dilan Amarasinghe",  "070 012 3456", "dilan@example.com",   "1987-01-09"),
    ("Sachini Dissanayake","071 111 2222", "sachini@example.com", "1991-05-16"),
    ("Rajith Mendis",      "072 222 3333", "rajith@example.com",  "1984-10-27"),
    ("Amali Ranasinghe",   "073 333 4444", "amali@example.com",   "1996-03-08"),
    ("Isuru Seneviratne",  "074 444 5555", "isuru@example.com",   "1979-07-19"),
    ("Kalpani Herath",     "075 555 6666", "kalpani@example.com", "1994-11-25"),
    ("Nuwan Pathirana",    "076 666 7777", "nuwan@example.com",   "1983-02-11"),
    ("Sanduni Liyanage",   "077 777 8888", "sanduni@example.com", "1997-06-04"),
    ("Chathura Madushanka","078 888 9999", "chathura@example.com","1986-09-13"),
    ("Tharindu Wijesinghe","079 999 0000", "tharindu@example.com","1992-12-29"),
    ("Anjali Cooray",      "070 101 2020", "anjali@example.com",  "1989-04-06"),
]

customer_docs = []
for fname, phone, email, dob in customer_data:
    customer_docs.append({
        "_id":                new_id(),
        "full_name":          fname,
        "phone":              phone,
        "email":              email,
        "date_of_birth":      dob,
        "address":            "Colombo, Sri Lanka",
        "credit_limit":       round(random.uniform(0, 5000), 2),
        "outstanding_balance": 0.0,
        "is_active":          True,
        "created_at":         ts(),
        "updated_at":         ts(),
        "created_by_id":      admin_id,
        "created_by_name":    admin_name,
    })

customer_docs = insert_if_empty(Collections.CUSTOMERS, customer_docs, "Customers")
customer_ids  = [str(d["_id"]) for d in customer_docs]
customer_map  = {str(d["_id"]): d["full_name"] for d in customer_docs}


# ── 8. Patients ───────────────────────────────────────────────────────────────

relationships = ["SELF", "SPOUSE", "CHILD", "PARENT", "SIBLING"]
patient_docs  = []

for cust in customer_docs:
    cust_id = str(cust["_id"])
    patient_docs.append({
        "_id":           new_id(),
        "customer_id":   cust_id,
        "name":          cust["full_name"],
        "relationship":  "SELF",
        "date_of_birth": cust.get("date_of_birth"),
        "is_active":     True,
        "created_at":    ts(),
        "updated_at":    ts(),
    })

patient_docs = insert_if_empty(Collections.PATIENTS, patient_docs, "Patients")
patient_ids  = [str(d["_id"]) for d in patient_docs]
patient_map  = {str(d["_id"]): d["name"] for d in patient_docs}


# ── 9. Doctors ────────────────────────────────────────────────────────────────

doctor_data = [
    ("Dr. Aruna Jayasena",      "General Practitioner",  "Colombo General Hospital",    "LIC-GP-001", "011 712 3456"),
    ("Dr. Pradeep Wijeratne",   "Cardiologist",          "National Heart Centre",        "LIC-CA-002", "011 823 4567"),
    ("Dr. Dilrukshi Mendis",    "Endocrinologist",       "Lady Ridgeway Hospital",       "LIC-EN-003", "011 934 5678"),
    ("Dr. Chaminda Fernando",   "Pulmonologist",         "Chest Hospital Welisara",      "LIC-PU-004", "011 045 6789"),
    ("Dr. Sunethra Senanayake", "Gastroenterologist",    "Colombo South Hospital",       "LIC-GA-005", "011 156 7890"),
    ("Dr. Rajeev Gunawardena",  "Rheumatologist",        "Kandy Teaching Hospital",      "LIC-RH-006", "081 267 8901"),
    ("Dr. Nadeeka Pathirana",   "Neurologist",           "Neurology Institute Colombo",  "LIC-NE-007", "011 378 9012"),
    ("Dr. Kasun Dissanayake",   "Dermatologist",         "Skin & Hair Clinic",           "LIC-DE-008", "011 489 0123"),
    ("Dr. Thilini Ranatunga",   "Pediatrician",          "Sirimavo Bandaranaike Hospital","LIC-PE-009", "081 590 1234"),
    ("Dr. Buddhika Amaraweera", "Orthopedic Surgeon",    "National Hospital Sri Lanka",  "LIC-OR-010", "011 601 2345"),
]

doctor_docs = []
for dname, spec, hospital, lic, phone in doctor_data:
    doctor_docs.append({
        "_id":                new_id(),
        "name":               dname,
        "specialization":     spec,
        "hospital_or_clinic": hospital,
        "license_number":     lic,
        "phone":              phone,
        "is_active":          True,
        "created_at":         ts(),
        "updated_at":         ts(),
    })

doctor_docs = insert_if_empty(Collections.DOCTORS, doctor_docs, "Doctors")
doctor_ids  = [str(d["_id"]) for d in doctor_docs]
doctor_map  = {str(d["_id"]): d["name"] for d in doctor_docs}


# ── 10. Purchase Orders (10) ──────────────────────────────────────────────────

po_statuses  = ["RECEIVED", "RECEIVED", "APPROVED", "SENT", "PARTIAL"]
po_docs      = []

for i in range(10):
    sup_idx   = i % len(supplier_ids)
    sup_id    = supplier_ids[sup_idx]
    ch_id     = channel_ids[sup_idx]
    ch_name   = channel_names[sup_idx]
    sup_name  = supplier_map[sup_id]

    items = []
    selected_prod_ids = random.sample(prod_ids, min(5, len(prod_ids)))
    total = 0.0
    for pid in selected_prod_ids:
        qty        = random.randint(10, 100)
        unit_price = round(random.uniform(10, 150), 2)
        line_total = round(qty * unit_price, 2)
        total     += line_total
        items.append({
            "product_id":   pid,
            "product_name": prod_map.get(pid, ""),
            "quantity":     qty,
            "unit_price":   unit_price,
            "total_price":  line_total,
        })

    status    = po_statuses[i % len(po_statuses)]
    po_id     = new_id()
    created_d = now - timedelta(days=random.randint(10, 90))

    po_docs.append({
        "_id":          po_id,
        "branch_id":    branch_id,
        "supplier_id":  sup_id,
        "supplier_name": sup_name,
        "channel_id":   ch_id,
        "channel_name": ch_name,
        "items":        items,
        "notes":        f"Purchase order #{i+1}",
        "total_amount": round(total, 2),
        "status":       status,
        "created_by":   admin_id,
        "approved_by":  admin_id if status not in ("DRAFT", "PENDING_APPROVAL") else None,
        "approved_at":  ts(created_d + timedelta(days=1)) if status not in ("DRAFT", "PENDING_APPROVAL") else None,
        "created_at":   ts(created_d),
        "updated_at":   ts(created_d + timedelta(days=2)),
    })

po_docs = insert_if_empty(Collections.PURCHASE_ORDERS, po_docs, "Purchase Orders")
po_ids  = [str(d["_id"]) for d in po_docs]


# ── 11. Prescriptions (10) ────────────────────────────────────────────────────

presc_docs = []

for i in range(10):
    patient_id  = patient_ids[i % len(patient_ids)]
    doctor_id   = doctor_ids[i % len(doctor_ids)]
    patient_name = patient_map.get(patient_id, "")
    doctor_name  = doctor_map.get(doctor_id, "")

    items = []
    for pid in random.sample(prod_ids, min(3, len(prod_ids))):
        items.append({
            "product_id":   pid,
            "product_name": prod_map.get(pid, ""),
            "dosage":       random.choice(["1 tablet", "2 tablets", "5mL", "10mL"]),
            "frequency":    random.choice(["Once daily", "Twice daily", "Three times daily", "As needed"]),
            "duration":     random.choice(["7 days", "14 days", "30 days", "3 months"]),
            "quantity":     random.randint(7, 90),
        })

    presc_date   = past(random.randint(1, 60))
    presc_expiry = future(random.randint(30, 180))

    presc_docs.append({
        "_id":            new_id(),
        "patient_id":     patient_id,
        "patient_name":   patient_name,
        "doctor_id":      doctor_id,
        "doctor_name":    doctor_name,
        "branch_id":      branch_id,
        "items":          items,
        "prescription_date": presc_date,
        "expiry_date":    presc_expiry,
        "is_active":      True,
        "usage_count":    0,
        "created_at":     ts(),
        "updated_at":     ts(),
    })

presc_docs = insert_if_empty(Collections.PRESCRIPTIONS, presc_docs, "Prescriptions")
presc_ids  = [str(d["_id"]) for d in presc_docs]


# ── 12. Sales (10) ────────────────────────────────────────────────────────────

payment_methods = ["CASH", "CARD", "BANK_TRANSFER", "CREDIT"]
sale_docs       = []

for i in range(10):
    cust_id   = customer_ids[i % len(customer_ids)]
    cust_name = customer_map.get(cust_id, "")
    pm        = payment_methods[i % len(payment_methods)]

    items      = []
    subtotal   = 0.0
    disc_total = 0.0
    for pid in random.sample(prod_ids, min(4, len(prod_ids))):
        qty        = random.randint(1, 10)
        unit_price = round(random.uniform(15, 350), 2)
        discount   = round(random.uniform(0, unit_price * 0.1), 2)
        line_total = round((unit_price - discount) * qty, 2)
        subtotal  += unit_price * qty
        disc_total += discount * qty

        inv_doc = db[Collections.INVENTORY].find_one({"product_id": pid, "branch_id": branch_id})
        batch_no = inv_doc["batches"][0]["batch_number"] if inv_doc and inv_doc.get("batches") else "BT00001"

        items.append({
            "product_id":      pid,
            "product_name":    prod_map.get(pid, ""),
            "batch_number":    batch_no,
            "quantity":        qty,
            "unit_price":      unit_price,
            "discount":        discount,
            "total_price":     line_total,
            "prescription_id": None,
        })

    total_amount = round(subtotal - disc_total, 2)
    paid_amount  = total_amount
    change       = 0.0

    sale_docs.append({
        "_id":           new_id(),
        "branch_id":     branch_id,
        "customer_id":   cust_id,
        "customer_name": cust_name,
        "items":         items,
        "payment_method": pm,
        "cheque_details": None,
        "subtotal":      round(subtotal, 2),
        "discount_total": round(disc_total, 2),
        "total_amount":  total_amount,
        "paid_amount":   paid_amount,
        "change_amount": change,
        "refund_amount": 0.0,
        "status":        "COMPLETED",
        "source":        "POS",
        "sales_order_id": None,
        "cashier_id":    admin_id,
        "cashier_name":  admin_name,
        "created_at":    ts(now - timedelta(days=random.randint(0, 30))),
        "updated_at":    ts(),
    })

sale_docs = insert_if_empty(Collections.SALES, sale_docs, "Sales")


# ── 13. Cash Registries ───────────────────────────────────────────────────────

cash_registry_docs = [
    {
        "_id":                 new_id(),
        "name":                "Main Cash Registry",
        "branch_id":           branch_id,
        "branch_name":         branch_name,
        "responsible_staff_id":   None,
        "responsible_staff_name": None,
        "current_balance":     round(random.uniform(5000, 50000), 2),
        "is_open":             False,
        "is_active":           True,
        "created_at":          ts(),
        "updated_at":          ts(),
        "created_by_id":       admin_id,
        "created_by_name":     admin_name,
        "updated_by_id":       admin_id,
        "updated_by_name":     admin_name,
    },
    {
        "_id":                 new_id(),
        "name":                "Counter 2 Registry",
        "branch_id":           branch_id,
        "branch_name":         branch_name,
        "responsible_staff_id":   None,
        "responsible_staff_name": None,
        "current_balance":     round(random.uniform(1000, 20000), 2),
        "is_open":             False,
        "is_active":           True,
        "created_at":          ts(),
        "updated_at":          ts(),
        "created_by_id":       admin_id,
        "created_by_name":     admin_name,
        "updated_by_id":       admin_id,
        "updated_by_name":     admin_name,
    },
]

cash_registry_docs = insert_if_empty(Collections.CASH_REGISTRIES, cash_registry_docs, "Cash Registries")


# ── 14. Bank Accounts ─────────────────────────────────────────────────────────

bank_account_docs = [
    {
        "_id":             new_id(),
        "bank_name":       "Bank of Ceylon",
        "account_number":  "001-2345-6789",
        "account_name":    "Medi Guide Pharmacy - Main",
        "branch_id":       branch_id,
        "branch_name":     branch_name,
        "current_balance": round(random.uniform(100000, 500000), 2),
        "is_active":       True,
        "created_at":      ts(),
        "updated_at":      ts(),
        "created_by_id":   admin_id,
        "created_by_name": admin_name,
        "updated_by_id":   admin_id,
        "updated_by_name": admin_name,
    },
    {
        "_id":             new_id(),
        "bank_name":       "Commercial Bank of Ceylon",
        "account_number":  "002-9876-5432",
        "account_name":    "Medi Guide Pharmacy - Operations",
        "branch_id":       branch_id,
        "branch_name":     branch_name,
        "current_balance": round(random.uniform(50000, 200000), 2),
        "is_active":       True,
        "created_at":      ts(),
        "updated_at":      ts(),
        "created_by_id":   admin_id,
        "created_by_name": admin_name,
        "updated_by_id":   admin_id,
        "updated_by_name": admin_name,
    },
]

bank_account_docs = insert_if_empty(Collections.BANK_ACCOUNTS, bank_account_docs, "Bank Accounts")
bank_account_ids  = [str(d["_id"]) for d in bank_account_docs]
bank_account_map  = {str(d["_id"]): d["account_name"] for d in bank_account_docs}
bank_name_map     = {str(d["_id"]): d["bank_name"] for d in bank_account_docs}


# ── 15. POS Machines ──────────────────────────────────────────────────────────

def _ba(idx):
    return bank_account_ids[idx % len(bank_account_ids)]

pos_machine_defs = [
    ("BOC-TID-001", "MID-78901234", "Main counter POS terminal",  0),
    ("COM-TID-002", "MID-98765432", "Counter 2 POS terminal",     1),
]

pos_machine_docs = []
for terminal_id, merchant_id, notes, ba_idx in pos_machine_defs:
    ba_id = _ba(ba_idx)
    pos_machine_docs.append({
        "_id":               new_id(),
        "bank_account_id":   ba_id,
        "bank_account_name": bank_account_map[ba_id],
        "bank_name":         bank_name_map[ba_id],
        "branch_id":         branch_id,
        "branch_name":       branch_name,
        "terminal_id":       terminal_id,
        "merchant_id":       merchant_id,
        "unsettled_amount":  0.0,
        "last_settled_at":   None,
        "is_active":         True,
        "notes":             notes,
        "created_at":        ts(),
        "updated_at":        ts(),
        "created_by_id":     admin_id,
        "created_by_name":   admin_name,
        "updated_by_id":     admin_id,
        "updated_by_name":   admin_name,
    })

pos_machine_docs = insert_if_empty(Collections.POS_MACHINES, pos_machine_docs, "POS Machines")


# ── 16. Cheque Books ──────────────────────────────────────────────────────────

cheque_book_defs = [
    ("BOC Series A", 1001, 1050, 50, "Bank of Ceylon cheque book 2024",    0),
    ("COM Series B", 2001, 2025, 25, "Commercial Bank cheque book 2024",   1),
]

cheque_book_docs = []
for series, start, end, leaves, notes, ba_idx in cheque_book_defs:
    ba_id = _ba(ba_idx)
    cheque_book_docs.append({
        "_id":               new_id(),
        "bank_account_id":   ba_id,
        "bank_account_name": bank_account_map[ba_id],
        "bank_name":         bank_name_map[ba_id],
        "branch_id":         branch_id,
        "branch_name":       branch_name,
        "series_name":       series,
        "start_number":      start,
        "end_number":        end,
        "total_leaves":      leaves,
        "used_leaves":       0,
        "is_active":         True,
        "notes":             notes,
        "created_at":        ts(),
        "updated_at":        ts(),
        "created_by_id":     admin_id,
        "created_by_name":   admin_name,
        "updated_by_id":     admin_id,
        "updated_by_name":   admin_name,
    })

cheque_book_docs = insert_if_empty(Collections.CHEQUE_BOOKS, cheque_book_docs, "Cheque Books")

print("\nDone. Sample data seeding complete.")
