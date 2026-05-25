import type { UserRole } from "@/types";
import {
  LayoutDashboard, Building2, Users, Package, Archive,
  Truck, ShoppingCart, Receipt, ClipboardList, UserCircle,
  ArrowLeftRight, UserCog, Wallet, BarChart3, Bell, ScrollText,
  Layers, FlaskConical, Tag, Ruler, Contact, Vault, Landmark, ArrowRightLeft, BookOpen, CreditCard,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  id:           string;
  label:        string;
  href?:        string;
  icon:         LucideIcon;
  requiredRole: UserRole;
  children?:    NavItem[];
  badge?:       string;
}

export const navigationConfig: NavItem[] = [
  {
    id:           "dashboard",
    label:        "Dashboard",
    href:         "/dashboard",
    icon:         LayoutDashboard,
    requiredRole: "BRANCH_USER",
  },
  {
    id:           "products",
    label:        "Product Catalog",
    icon:         Package,
    requiredRole: "MANAGER",
    children: [
      {
        id:           "products-list",
        label:        "Products",
        href:         "/products",
        icon:         Package,
        requiredRole: "MANAGER",
      },
      {
        id:           "products-generics",
        label:        "Generics",
        href:         "/products/generics",
        icon:         FlaskConical,
        requiredRole: "MANAGER",
      },
      {
        id:           "products-brands",
        label:        "Brands",
        href:         "/products/brands",
        icon:         Tag,
        requiredRole: "MANAGER",
      },
      {
        id:           "products-categories",
        label:        "Categories",
        href:         "/products/categories",
        icon:         Layers,
        requiredRole: "MANAGER",
      },
      {
        id:           "products-skus",
        label:        "SKUs",
        href:         "/products/skus",
        icon:         Ruler,
        requiredRole: "MANAGER",
      },
    ],
  },
  {
    id:           "purchases",
    label:        "Purchases",
    icon:         ShoppingCart,
    requiredRole: "BRANCH_USER",
    children: [
      {
        id:           "purchases-orders",
        label:        "Orders",
        href:         "/purchases/orders",
        icon:         ShoppingCart,
        requiredRole: "BRANCH_USER",
      },
      {
        id:           "purchases-invoices",
        label:        "Invoices",
        href:         "/purchases/invoices",
        icon:         Archive,
        requiredRole: "BRANCH_USER",
      },
      {
        id:           "suppliers",
        label:        "Suppliers",
        href:         "/purchases/suppliers",
        icon:         Truck,
        requiredRole: "MANAGER",
      },
    ],
  },
  {
    id:           "sales",
    label:        "Sales",
    icon:         Receipt,
    requiredRole: "BRANCH_USER",
    children: [
      {
        id:           "sales-pos",
        label:        "Point of Sale",
        href:         "/sales/pos",
        icon:         ShoppingCart,
        requiredRole: "BRANCH_USER",
      },
      {
        id:           "sales-invoices",
        label:        "Invoices",
        href:         "/sales/invoices",
        icon:         Receipt,
        requiredRole: "BRANCH_USER",
      },
      {
        id:           "sales-orders",
        label:        "Orders",
        href:         "/sales/orders",
        icon:         ClipboardList,
        requiredRole: "BRANCH_USER",
      },
      {
        id:           "customers",
        label:        "Customers",
        href:         "/sales/customers",
        icon:         Contact,
        requiredRole: "BRANCH_USER",
      },
    ],
  },
  {
    id:           "inventory",
    label:        "Inventory",
    icon:         Archive,
    requiredRole: "BRANCH_USER",
    children: [
      {
        id:           "inventory-main",
        label:        "Inventory",
        href:         "/inventory",
        icon:         Archive,
        requiredRole: "BRANCH_USER",
      },
      {
        id:           "stock-transfer",
        label:        "Stock Transfer",
        href:         "/inventory/stock-transfers",
        icon:         ArrowLeftRight,
        requiredRole: "BRANCH_MANAGER",
      },
    ],
  },
  {
    id:           "prescription-management",
    label:        "Prescription Management",
    icon:         ClipboardList,
    requiredRole: "BRANCH_USER",
    children: [
      {
        id:           "prescriptions",
        label:        "Prescriptions",
        href:         "/prescriptions",
        icon:         ClipboardList,
        requiredRole: "BRANCH_USER",
      },
      {
        id:           "prescription-patients",
        label:        "Patients",
        href:         "/prescriptions/patients",
        icon:         UserCircle,
        requiredRole: "BRANCH_USER",
      },
      {
        id:           "prescription-doctors",
        label:        "Doctors",
        href:         "/prescriptions/doctors",
        icon:         UserCog,
        requiredRole: "BRANCH_USER",
      },
    ],
  },
  {
    id:           "reports",
    label:        "Reports & Analytics",
    href:         "/reports",
    icon:         BarChart3,
    requiredRole: "BRANCH_ADMIN",
  },
  {
    id:           "staff",
    label:        "Staff",
    icon:         Users,
    requiredRole: "BRANCH_USER",
    children: [
      {
        id:           "staff-list",
        label:        "Staff Members",
        href:         "/staff",
        icon:         Users,
        requiredRole: "BRANCH_ADMIN",
      },
      {
        id:           "attendance",
        label:        "Attendance",
        href:         "/staff/attendance",
        icon:         UserCog,
        requiredRole: "BRANCH_USER",
      },
      {
        id:           "payroll",
        label:        "Payroll",
        href:         "/staff/payroll",
        icon:         Wallet,
        requiredRole: "BRANCH_ADMIN",
      },
    ],
  },
  {
    id:           "ledger",
    label:        "Ledger Accounts",
    icon:         Wallet,
    requiredRole: "BRANCH_USER",
    children: [
      {
        id:           "billing-main",
        label:        "Billing & Payments",
        href:         "/billing",
        icon:         Receipt,
        requiredRole: "BRANCH_USER",
      },
      {
        id:           "cash-registries",
        label:        "Cash Registries",
        href:         "/billing/registries",
        icon:         Vault,
        requiredRole: "BRANCH_USER",
      },
      {
        id:           "bank-accounts",
        label:        "Bank Accounts",
        href:         "/ledger/bank-accounts",
        icon:         Landmark,
        requiredRole: "BRANCH_MANAGER",
      },
      {
        id:           "bank-group",
        label:        "Bank",
        icon:         BookOpen,
        requiredRole: "BRANCH_MANAGER",
        children: [
          {
            id:           "cheque-books",
            label:        "Cheque Books",
            href:         "/ledger/bank/cheque-books",
            icon:         BookOpen,
            requiredRole: "BRANCH_MANAGER",
          },
          {
            id:           "pos-machines",
            label:        "POS Machines",
            href:         "/ledger/bank/pos-machines",
            icon:         CreditCard,
            requiredRole: "BRANCH_MANAGER",
          },
        ],
      },
      {
        id:           "fund-transfers",
        label:        "Fund Transfers",
        href:         "/ledger/transfers",
        icon:         ArrowRightLeft,
        requiredRole: "BRANCH_MANAGER",
      },
    ],
  },
  {
    id:           "users",
    label:        "Users",
    href:         "/users",
    icon:         Users,
    requiredRole: "BRANCH_ADMIN",
  },
  {
    id:           "branches",
    label:        "Branches",
    href:         "/branches",
    icon:         Building2,
    requiredRole: "MANAGER",
  },
  {
    id:           "notifications",
    label:        "Notifications",
    href:         "/notifications",
    icon:         Bell,
    requiredRole: "BRANCH_USER",
  },
  {
    id:           "audit-log",
    label:        "Audit Log",
    href:         "/audit-log",
    icon:         ScrollText,
    requiredRole: "ADMIN",
  },
];
