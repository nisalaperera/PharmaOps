# PharmaOps

Multi-branch Pharmacy Management System for **Medi Guide Pharmacy**.

## Overview

PharmaOps is a full-stack web application that centralises operations across multiple pharmacy branches — covering sales, inventory, purchasing, staff, prescriptions, patients, and reporting under a single platform.

## Architecture

```
PharmaOps/
├── frontend/   # Next.js 14 + TypeScript + Tailwind CSS
└── backend/    # FastAPI + MongoDB
```

## Modules

| Module | Description |
|--------|-------------|
| Authentication | JWT-based login with role-gated access |
| Branches | Multi-branch setup and management |
| Users | Staff accounts with role-based permissions |
| Products | Product catalogue, generics, brands, categories |
| Inventory | Batch tracking, expiry alerts, low-stock monitoring |
| Suppliers | Supplier channels and credit terms |
| Purchase Orders | PO creation, approval workflow, GRN |
| Sales / POS | Point-of-sale with prescription support |
| Prescriptions | Doctor-issued prescriptions linked to patients |
| Patients | Patient profiles and family members |
| Stock Transfer | Inter-branch stock transfers |
| Staff | Staff records, shifts, and attendance |
| Payroll | Salary calculation, deductions, EPF/ETF |
| Reports | Sales, stock valuation, expiry, attendance |
| Notifications | Low stock, expiry, PO approval alerts |
| Audit Log | Full action trail per user |

## Roles

| Role | Scope |
|------|-------|
| `ADMIN` | Full system access |
| `MANAGER` | Organisation-wide access, no system config |
| `BRANCH_ADMIN` | Full access within assigned branch |
| `BRANCH_MANAGER` | Operational access within assigned branch |
| `BRANCH_USER` | Limited day-to-day access within assigned branch |

## Quick Start

See [`frontend/README.md`](frontend/README.md) and [`backend/README.md`](backend/README.md) for setup instructions.

## API Documentation

Once the backend is running, interactive API docs are available at:

- Swagger UI: `http://localhost:8000/api/docs`
- ReDoc: `http://localhost:8000/api/redoc`
