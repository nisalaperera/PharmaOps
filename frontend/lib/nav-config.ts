import type { UserRole } from "@/types";
import {
  LayoutDashboard, Building2, Users, Package, Archive,
  Truck, ShoppingCart, Receipt, ClipboardList, UserCircle,
  ArrowLeftRight, UserCog, Wallet, BarChart3, Bell, ScrollText,
  Layers, FlaskConical, Tag, Ruler,
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
    id:           "branches",
    label:        "Branches",
    href:         "/branches",
    icon:         Building2,
    requiredRole: "MANAGER",
  },
  {
    id:           "users",
    label:        "User Management",
    href:         "/users",
    icon:         Users,
    requiredRole: "BRANCH_ADMIN",
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
        id:           "products-units",
        label:        "Units",
        href:         "/products/units",
        icon:         Ruler,
        requiredRole: "MANAGER",
      },
    ],
  },
  {
    id:           "inventory",
    label:        "Inventory",
    href:         "/inventory",
    icon:         Archive,
    requiredRole: "BRANCH_USER",
  },
  {
    id:           "suppliers",
    label:        "Suppliers",
    href:         "/suppliers",
    icon:         Truck,
    requiredRole: "MANAGER",
  },
  {
    id:           "purchase-orders",
    label:        "Purchase Orders",
    icon:         ShoppingCart,
    requiredRole: "BRANCH_USER",
    children: [
      {
        id:           "po-list",
        label:        "Orders",
        href:         "/purchase-orders",
        icon:         ShoppingCart,
        requiredRole: "BRANCH_USER",
      },
      {
        id:           "po-grn",
        label:        "Goods Received",
        href:         "/purchase-orders/grn",
        icon:         Archive,
        requiredRole: "BRANCH_USER",
      },
    ],
  },
  {
    id:           "pos",
    label:        "Point of Sale",
    href:         "/pos",
    icon:         Receipt,
    requiredRole: "BRANCH_USER",
  },
  {
    id:           "billing",
    label:        "Billing & Payments",
    href:         "/billing",
    icon:         Wallet,
    requiredRole: "BRANCH_USER",
  },
  {
    id:           "prescriptions",
    label:        "Prescriptions",
    href:         "/prescriptions",
    icon:         ClipboardList,
    requiredRole: "BRANCH_USER",
  },
  {
    id:           "patients",
    label:        "Patients",
    href:         "/patients",
    icon:         UserCircle,
    requiredRole: "BRANCH_USER",
  },
  {
    id:           "doctors",
    label:        "Doctors",
    href:         "/doctors",
    icon:         UserCog,
    requiredRole: "BRANCH_USER",
  },
  {
    id:           "stock-transfer",
    label:        "Stock Transfer",
    href:         "/stock-transfer",
    icon:         ArrowLeftRight,
    requiredRole: "BRANCH_MANAGER",
  },
  {
    id:           "staff",
    label:        "Staff & Attendance",
    icon:         Users,
    requiredRole: "BRANCH_ADMIN",
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
        requiredRole: "BRANCH_ADMIN",
      },
    ],
  },
  {
    id:           "payroll",
    label:        "Payroll",
    href:         "/payroll",
    icon:         Wallet,
    requiredRole: "BRANCH_ADMIN",
  },
  {
    id:           "reports",
    label:        "Reports & Analytics",
    href:         "/reports",
    icon:         BarChart3,
    requiredRole: "BRANCH_ADMIN",
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
