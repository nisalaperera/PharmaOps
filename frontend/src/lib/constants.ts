import type { UserRole, UserStatus } from "@/types";
import { getRoleLabel } from "@/lib/utils";

// ─── Pagination ────────────────────────────────────────────────────────────────

export const PAGE_SIZE_OPTIONS: number[] = [10, 20, 50, 100];
export const DEFAULT_PAGE_SIZE          = 10;

// ─── Role ──────────────────────────────────────────────────────────────────────

/** All roles ordered highest → lowest privilege, for dropdowns */
export const ROLE_OPTIONS: { value: UserRole; label: string }[] = (
  ["ADMIN", "MANAGER", "BRANCH_ADMIN", "BRANCH_MANAGER", "BRANCH_USER"] as UserRole[]
).map((value) => ({ value, label: getRoleLabel(value) }));

/** Roles that require a branch assignment */
export const BRANCH_ROLES: UserRole[] = ["BRANCH_ADMIN", "BRANCH_MANAGER", "BRANCH_USER"];

// ─── User Status ───────────────────────────────────────────────────────────────

export const USER_STATUS_OPTIONS: { value: UserStatus; label: string }[] = [
  { value: "ACTIVE",   label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
];

/** For filter dropdowns — includes an "All" option */
export const USER_STATUS_FILTER_OPTIONS: { value: UserStatus | ""; label: string }[] = [
  { value: "",         label: "All Statuses" },
  { value: "ACTIVE",   label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
];

// ─── Active / Inactive filter (branches, staff, suppliers, …) ─────────────────

export const ACTIVE_STATUS_OPTIONS = [
  { value: "",      label: "All Statuses" },
  { value: "true",  label: "Active" },
  { value: "false", label: "Inactive" },
];

// ─── Staff ─────────────────────────────────────────────────────────────────────

import type { ShiftType, EmploymentType, AttendanceStatus } from "@/types";

export const STAFF_TITLE_OPTIONS: { value: string; label: string }[] = [
  { value: "",      label: "No title" },
  { value: "Mr.",   label: "Mr." },
  { value: "Mrs.",  label: "Mrs." },
  { value: "Ms.",   label: "Ms." },
  { value: "Dr.",   label: "Dr." },
  { value: "Prof.", label: "Prof." },
];

/** Common job titles for pharmacy staff */
export const STAFF_POSITION_OPTIONS: string[] = [
  "Pharmacist",
  "Pharmacy Technician",
  "Cashier",
  "Branch Manager",
  "Delivery Staff",
  "Other",
];

export const SHIFT_TYPE_OPTIONS: { value: ShiftType; label: string }[] = [
  { value: "MORNING",  label: "Morning" },
  { value: "EVENING",  label: "Evening" },
  { value: "FULL_DAY", label: "Full Day" },
];

export const SHIFT_TYPE_FILTER_OPTIONS: { value: ShiftType | ""; label: string }[] = [
  { value: "",         label: "All Shifts" },
  { value: "MORNING",  label: "Morning" },
  { value: "EVENING",  label: "Evening" },
  { value: "FULL_DAY", label: "Full Day" },
];

export const EMPLOYMENT_TYPE_OPTIONS: { value: EmploymentType; label: string }[] = [
  { value: "SALARIED", label: "Salaried" },
  { value: "HOURLY",   label: "Hourly" },
];

export const EMPLOYMENT_TYPE_FILTER_OPTIONS: { value: EmploymentType | ""; label: string }[] = [
  { value: "",         label: "All Types" },
  { value: "SALARIED", label: "Salaried" },
  { value: "HOURLY",   label: "Hourly" },
];

// ─── Attendance ────────────────────────────────────────────────────────────────

export const ATTENDANCE_STATUS_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: "PRESENT",  label: "Present" },
  { value: "ABSENT",   label: "Absent" },
  { value: "LATE",     label: "Late" },
  { value: "HALF_DAY", label: "Half Day" },
];

export const ATTENDANCE_STATUS_FILTER_OPTIONS: { value: AttendanceStatus | ""; label: string }[] = [
  { value: "",         label: "All Statuses" },
  { value: "PRESENT",  label: "Present" },
  { value: "ABSENT",   label: "Absent" },
  { value: "LATE",     label: "Late" },
  { value: "HALF_DAY", label: "Half Day" },
];

// ─── SKU type ─────────────────────────────────────────────────────────────────

import type { SkuType } from "@/types";

export const SKU_TYPE_OPTIONS: { value: SkuType; label: string }[] = [
  { value: "COUNT",  label: "Count"  },
  { value: "VOLUME", label: "Volume" },
  { value: "WEIGHT", label: "Weight" },
  { value: "LENGTH", label: "Length" },
];

export const SKU_TYPE_FILTER_OPTIONS: { value: SkuType | ""; label: string }[] = [
  { value: "",       label: "All Types" },
  { value: "COUNT",  label: "Count"     },
  { value: "VOLUME", label: "Volume"    },
  { value: "WEIGHT", label: "Weight"    },
  { value: "LENGTH", label: "Length"    },
];

// ─── Stock Out reasons ────────────────────────────────────────────────────────

export const STOCK_OUT_REASON_OPTIONS: { value: string; label: string }[] = [
  { value: "DAMAGED", label: "Damaged" },
  { value: "EXPIRED", label: "Expired" },
  { value: "OTHER",   label: "Other"   },
];

// ─── Transfer status ─────────────────────────────────────────────────────────

import type { TransferStatus } from "@/types";

export const TRANSFER_STATUS_FILTER_OPTIONS: { value: TransferStatus | ""; label: string }[] = [
  { value: "",           label: "All Statuses" },
  { value: "PENDING",    label: "Pending"       },
  { value: "CONFIRMED",  label: "Confirmed"     },
  { value: "REJECTED",   label: "Rejected"      },
  { value: "CANCELLED",  label: "Cancelled"     },
];

export const TRANSFER_STATUS_LABEL: Record<TransferStatus, string> = {
  PENDING:   "Pending",
  CONFIRMED: "Confirmed",
  REJECTED:  "Rejected",
  CANCELLED: "Cancelled",
};

// ─── GRN / Purchase Invoice Status ────────────────────────────────────────────

import type { GRNStatus, PurchaseInvoicePaymentStatus, SalesOrderStatus } from "@/types";

export const GRN_STATUS_FILTER_OPTIONS: { value: GRNStatus | ""; label: string }[] = [
  { value: "",          label: "All Statuses" },
  { value: "PENDING",   label: "Pending"      },
  { value: "PARTIAL",   label: "Partial"      },
  { value: "COMPLETED", label: "Completed"    },
];

export const PURCHASE_INVOICE_PAYMENT_STATUS_FILTER_OPTIONS: { value: PurchaseInvoicePaymentStatus | ""; label: string }[] = [
  { value: "",               label: "All Payment Statuses" },
  { value: "UNPAID",         label: "Unpaid"               },
  { value: "PARTIALLY_PAID", label: "Partially Paid"       },
  { value: "PAID",           label: "Paid"                 },
];

// ─── Sales Order Status ────────────────────────────────────────────────────────

export const SALES_ORDER_STATUS_FILTER_OPTIONS: { value: SalesOrderStatus | ""; label: string }[] = [
  { value: "",           label: "All Statuses" },
  { value: "DRAFT",      label: "Draft"        },
  { value: "CONFIRMED",  label: "Confirmed"    },
  { value: "INVOICED",   label: "Invoiced"     },
  { value: "CANCELLED",  label: "Cancelled"    },
];

// ─── POS Card Types ───────────────────────────────────────────────────────────

import type { PosCardType } from "@/types";

export const POS_CARD_TYPE_OPTIONS: { value: PosCardType; label: string }[] = [
  { value: "VISA",       label: "Visa"              },
  { value: "MASTERCARD", label: "Mastercard"         },
  { value: "AMEX",       label: "American Express"   },
  { value: "OTHER",      label: "Other"              },
];

export const POS_CARD_TYPE_FILTER_OPTIONS: { value: PosCardType | ""; label: string }[] = [
  { value: "",           label: "All Card Types"    },
  { value: "VISA",       label: "Visa"              },
  { value: "MASTERCARD", label: "Mastercard"        },
  { value: "AMEX",       label: "American Express"  },
  { value: "OTHER",      label: "Other"             },
];

// ─── Purchase Order ────────────────────────────────────────────────────────────

import type { PurchaseOrderStatus } from "@/types";

export const PO_STATUS_FILTER_OPTIONS: { value: PurchaseOrderStatus | ""; label: string }[] = [
  { value: "",                 label: "All Statuses"     },
  { value: "DRAFT",            label: "Draft"            },
  { value: "PENDING_APPROVAL", label: "Pending Approval" },
  { value: "APPROVED",         label: "Approved"         },
  { value: "SENT",             label: "Sent"             },
  { value: "PARTIAL",          label: "Partial"          },
  { value: "RECEIVED",         label: "Received"         },
  { value: "CANCELLED",        label: "Cancelled"        },
];

// ─── Inventory ────────────────────────────────────────────────────────────────

export const LOW_STOCK_FILTER_OPTIONS = [
  { value: "",      label: "All Stock Levels" },
  { value: "true",  label: "Low Stock Only"   },
  { value: "false", label: "In Stock"         },
];

// ─── Payroll ───────────────────────────────────────────────────────────────────

import type { DeductionType } from "@/types";

export const DEDUCTION_TYPE_OPTIONS: { value: DeductionType; label: string }[] = [
  { value: "TAX",   label: "Tax"   },
  { value: "EPF",   label: "EPF"   },
  { value: "ETF",   label: "ETF"   },
  { value: "LOAN",  label: "Loan"  },
  { value: "OTHER", label: "Other" },
];

export const PAYROLL_PAID_FILTER_OPTIONS = [
  { value: "",      label: "All Statuses" },
  { value: "true",  label: "Paid"         },
  { value: "false", label: "Unpaid"       },
];

export const MONTH_OPTIONS: { value: number; label: string }[] = [
  { value: 1,  label: "January"   },
  { value: 2,  label: "February"  },
  { value: 3,  label: "March"     },
  { value: 4,  label: "April"     },
  { value: 5,  label: "May"       },
  { value: 6,  label: "June"      },
  { value: 7,  label: "July"      },
  { value: 8,  label: "August"    },
  { value: 9,  label: "September" },
  { value: 10, label: "October"   },
  { value: 11, label: "November"  },
  { value: 12, label: "December"  },
];

export const MONTH_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "",   label: "All Months" },
  { value: "1",  label: "January"   },
  { value: "2",  label: "February"  },
  { value: "3",  label: "March"     },
  { value: "4",  label: "April"     },
  { value: "5",  label: "May"       },
  { value: "6",  label: "June"      },
  { value: "7",  label: "July"      },
  { value: "8",  label: "August"    },
  { value: "9",  label: "September" },
  { value: "10", label: "October"   },
  { value: "11", label: "November"  },
  { value: "12", label: "December"  },
];

// ─── Patient Relationship ─────────────────────────────────────────────────────

import type { PatientRelationship } from "@/types";

export const RELATIONSHIP_OPTIONS: { value: PatientRelationship; label: string }[] = [
  { value: "SELF",    label: "Self"    },
  { value: "SPOUSE",  label: "Spouse"  },
  { value: "CHILD",   label: "Child"   },
  { value: "PARENT",  label: "Parent"  },
  { value: "SIBLING", label: "Sibling" },
  { value: "OTHER",   label: "Other"   },
];

export const RELATIONSHIP_FILTER_OPTIONS: { value: PatientRelationship | ""; label: string }[] = [
  { value: "",        label: "All Relationships" },
  { value: "SELF",    label: "Self"              },
  { value: "SPOUSE",  label: "Spouse"            },
  { value: "CHILD",   label: "Child"             },
  { value: "PARENT",  label: "Parent"            },
  { value: "SIBLING", label: "Sibling"           },
  { value: "OTHER",   label: "Other"             },
];

// ─── Sales / Billing ──────────────────────────────────────────────────────────

import type { SaleStatus, PaymentMethod, CreditPaymentMethod } from "@/types";

export const SALE_STATUS_FILTER_OPTIONS: { value: SaleStatus | ""; label: string }[] = [
  { value: "",               label: "All Statuses"   },
  { value: "COMPLETED",      label: "Completed"      },
  { value: "REFUNDED",       label: "Refunded"       },
  { value: "PARTIAL_REFUND", label: "Partial Refund" },
];

export const PAYMENT_METHOD_FILTER_OPTIONS: { value: PaymentMethod | ""; label: string }[] = [
  { value: "",              label: "All Methods"   },
  { value: "CASH",          label: "Cash"          },
  { value: "CARD",          label: "Card"          },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "CREDIT",        label: "Credit"        },
  { value: "CHEQUE",        label: "Cheque"        },
];

export const CREDIT_PAYMENT_METHOD_OPTIONS: { value: CreditPaymentMethod; label: string }[] = [
  { value: "CASH",          label: "Cash"          },
  { value: "CARD",          label: "Card"          },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "CHEQUE",        label: "Cheque"        },
];

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH:          "Cash",
  CARD:          "Card",
  BANK_TRANSFER: "Bank Transfer",
  CREDIT:        "Credit",
  CHEQUE:        "Cheque",
};

export const SALE_STATUS_LABEL: Record<string, string> = {
  COMPLETED:      "Completed",
  REFUNDED:       "Refunded",
  PARTIAL_REFUND: "Partial Refund",
};

// ─── Treasury ─────────────────────────────────────────────────────────────────

import type { RegistryTransactionType, FundSourceType } from "@/types";

export const REGISTRY_TRANSACTION_TYPE_FILTER_OPTIONS: { value: RegistryTransactionType | ""; label: string }[] = [
  { value: "",            label: "All Types"    },
  { value: "OPENING",     label: "Opening"      },
  { value: "CLOSING",     label: "Closing"      },
  { value: "DEPOSIT",     label: "Deposit"      },
  { value: "WITHDRAWAL",  label: "Withdrawal"   },
  { value: "TRANSFER_IN", label: "Transfer In"  },
  { value: "TRANSFER_OUT",label: "Transfer Out" },
];

export const REGISTRY_TRANSACTION_TYPE_LABEL: Record<RegistryTransactionType, string> = {
  OPENING:      "Opening",
  CLOSING:      "Closing",
  DEPOSIT:      "Deposit",
  WITHDRAWAL:   "Withdrawal",
  TRANSFER_IN:  "Transfer In",
  TRANSFER_OUT: "Transfer Out",
};

export const FUND_SOURCE_TYPE_OPTIONS: { value: FundSourceType; label: string }[] = [
  { value: "CASH_REGISTRY", label: "Cash Registry" },
  { value: "BANK_ACCOUNT",  label: "Bank Account"  },
];

export const FUND_SOURCE_TYPE_LABEL: Record<FundSourceType, string> = {
  CASH_REGISTRY: "Cash Registry",
  BANK_ACCOUNT:  "Bank Account",
};


// ─── Supplier ─────────────────────────────────────────────────────────────────

import type {
  SupplierType, ChannelCategory, ContactType, ContactTitle, DeliveryFrequency,
} from "@/types";

export const SUPPLIER_TYPE_OPTIONS: { value: SupplierType; label: string }[] = [
  { value: "AGENCY",      label: "Agency"      },
  { value: "DISTRIBUTOR", label: "Distributor" },
];

export const SUPPLIER_TYPE_FILTER_OPTIONS: { value: SupplierType | ""; label: string }[] = [
  { value: "",            label: "All Types"   },
  { value: "AGENCY",      label: "Agency"      },
  { value: "DISTRIBUTOR", label: "Distributor" },
];

export const CHANNEL_CATEGORY_OPTIONS: { value: ChannelCategory; label: string }[] = [
  { value: "AGENCY", label: "Agency" },
  { value: "SUB",    label: "Sub"    },
];

export const CONTACT_TYPE_OPTIONS: { value: ContactType; label: string }[] = [
  { value: "SALES",    label: "Sales"    },
  { value: "DELIVERY", label: "Delivery" },
];

export const CONTACT_TITLE_OPTIONS: { value: ContactTitle | ""; label: string }[] = [
  { value: "",       label: "No Title" },
  { value: "Mr.",    label: "Mr."      },
  { value: "Mrs.",   label: "Mrs."     },
  { value: "Ms.",    label: "Ms."      },
  { value: "Dr.",    label: "Dr."      },
  { value: "Prof.",  label: "Prof."    },
];

export const DELIVERY_FREQUENCY_OPTIONS: { value: DeliveryFrequency; label: string }[] = [
  { value: "DAILY",     label: "Daily"      },
  { value: "WEEKLY",    label: "Weekly"     },
  { value: "BI_WEEKLY", label: "Bi-Weekly"  },
  { value: "MONTHLY",   label: "Monthly"    },
  { value: "AS_NEEDED", label: "As Needed"  },
];

export const DELIVERY_FREQUENCY_LABEL: Record<DeliveryFrequency, string> = {
  DAILY:     "Daily",
  WEEKLY:    "Weekly",
  BI_WEEKLY: "Bi-Weekly",
  MONTHLY:   "Monthly",
  AS_NEEDED: "As Needed",
};

// ─── Cheque Issue Status ───────────────────────────────────────────────────────

import type { ChequeIssueStatus } from "@/types";

export const CHEQUE_ISSUE_STATUS_FILTER_OPTIONS: { value: ChequeIssueStatus | ""; label: string }[] = [
  { value: "",          label: "All Statuses" },
  { value: "ISSUED",    label: "Issued"       },
  { value: "CLEARED",   label: "Cleared"      },
  { value: "BOUNCED",   label: "Bounced"      },
  { value: "CANCELLED", label: "Cancelled"    },
];

export const CHEQUE_ISSUE_STATUS_LABEL: Record<ChequeIssueStatus, string> = {
  ISSUED:    "Issued",
  CLEARED:   "Cleared",
  BOUNCED:   "Bounced",
  CANCELLED: "Cancelled",
};
