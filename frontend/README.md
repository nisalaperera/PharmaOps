# PharmaOps — Frontend

Next.js 14 frontend for the PharmaOps pharmacy management system.

## Tech Stack

| Tool | Purpose |
|------|---------|
| Next.js 14 (App Router) | Framework |
| TypeScript | Language |
| Tailwind CSS | Styling |
| TanStack Query v5 | Server state & caching |
| react-hook-form + Zod | Forms & validation |
| next-auth v4 | Authentication |
| Firebase | File storage |
| Axios | HTTP client |
| react-hot-toast | Notifications |
| Lucide React | Icons |
| Recharts | Charts |

## Prerequisites

- Node.js 18+
- npm or yarn
- PharmaOps backend running (see `../backend/README.md`)

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment**

   ```bash
   cp .env.example .env.local
   ```

   Fill in all values in `.env.local` (see [Environment Variables](#environment-variables)).

3. **Run development server**

   ```bash
   npm run dev
   ```

   The app will be available at `http://localhost:3000`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |

## Environment Variables

Copy `.env.example` to `.env.local` and fill in the values:

```env
# API
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=

# Firebase
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

## Project Structure

```
frontend/
├── src/
│   ├── app/                        # Routing layer only
│   │   ├── (auth)/                 # Login page
│   │   └── (dashboard)/            # Authenticated pages (thin wrappers)
│   │       ├── branches/page.tsx
│   │       ├── dashboard/page.tsx
│   │       ├── profile/page.tsx
│   │       ├── settings/page.tsx
│   │       ├── users/page.tsx
│   │       └── layout.tsx
│   ├── modules/                    # Domain feature code
│   │   ├── branches/
│   │   │   ├── components/         # BranchModal
│   │   │   └── schemas.ts
│   │   ├── profile/
│   │   │   ├── components/         # AvatarUpload, ChangePasswordModal
│   │   │   └── schemas.ts
│   │   └── users/
│   │       ├── components/         # UserModal, PasswordResetModal, GeneratedPasswordAlert
│   │       └── schemas.ts
│   ├── components/                 # Shared reusable UI
│   │   ├── common/                 # DataTable, Pagination, SearchBar
│   │   ├── layout/                 # Header, Sidebar, Breadcrumb, ThemeToggle
│   │   └── ui/                     # Button, Input, Modal, Card, Badge, ConfirmModal
│   ├── hooks/                      # useAuth, usePagination
│   ├── lib/                        # Shared utilities & config
│   │   ├── api-client.ts           # Axios instance + request helpers
│   │   ├── badges.ts               # Badge variant mappings
│   │   ├── config.ts               # App & org branding config
│   │   ├── constants.ts            # Shared option arrays (roles, statuses)
│   │   ├── nav-config.ts           # Sidebar navigation structure
│   │   └── utils.ts                # formatDate, formatPhoneNumber, cn, etc.
│   └── types/
│       └── index.ts                # All TypeScript types & interfaces
└── public/                         # Static assets
```

## Key Conventions

- **Modules** — domain components and schemas live in `src/modules/<name>/`, not alongside pages
- **Pages** — `src/app/(dashboard)/<name>/page.tsx` is a thin routing layer; all feature logic imports from `src/modules/`
- **Shared constants** (dropdowns, options) → `src/lib/constants.ts`
- **Badge variant mappings** → `src/lib/badges.ts`
- **TypeScript types** → `src/types/index.ts`
- **Phone fields** — always use `Controller` + `formatPhoneNumber` + `maxLength={12}` + regex `### ### ####`
- **Pagination** — all list pages use `usePagination`; pages only add their own domain `filters` on top
