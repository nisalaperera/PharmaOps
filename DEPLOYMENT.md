# PharmaOps — GCP Cloud Run Deployment Guide

Deploys **frontend** (Next.js) and **backend** (FastAPI) as separate Cloud Run services in `asia-south1` using GitHub Actions + Docker.

Each setup step shows both a **Console (UI)** method and a **CLI** method — use whichever you prefer.

---

## Architecture

```
GitHub (master branch)
    │
    └── GitHub Actions
            ├── Build backend image  → Artifact Registry
            │       └── Deploy → Cloud Run: pharmaops-backend
            │
            └── Build frontend image → Artifact Registry
                    └── Deploy → Cloud Run: pharmaops-frontend
```

| Service | Cloud Run Name | Port |
|---------|---------------|------|
| FastAPI backend | `pharmaops-backend` | 8080 |
| Next.js frontend | `pharmaops-frontend` | 8080 |

---

## Prerequisites

- Owner / Editor access on GCP project `medi-guide-7008e`
- Admin access on GitHub repo `nisalaperera/PharmaOps`
- [gcloud CLI](https://cloud.google.com/sdk/docs/install) installed (for CLI method only)

---

## Step 1 — Enable GCP APIs

### Via GCP Console

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and confirm project **medi-guide-7008e** is selected in the top dropdown.
2. Open the left menu → **APIs & Services** → **Library**.
3. Search for and **Enable** each API below (click the name → click **Enable**):

   | API to search | What it's for |
   |---------------|--------------|
   | `Cloud Run Admin API` | Hosts your containers |
   | `Artifact Registry API` | Stores your Docker images |
   | `Identity and Access Management (IAM) API` | Manages permissions |
   | `IAM Service Account Credentials API` | Required for Workload Identity |
   | `Secret Manager API` | Stores sensitive credentials |

### Via CLI

```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  secretmanager.googleapis.com \
  --project=medi-guide-7008e
```

---

## Step 2 — Create Artifact Registry Repository

### Via GCP Console

1. Open the left menu → **Artifact Registry** → **Repositories**.
2. Click **+ Create Repository** and fill in:

   | Field | Value |
   |-------|-------|
   | Name | `pharmaops` |
   | Format | `Docker` |
   | Mode | `Standard` |
   | Location type | `Region` |
   | Region | `asia-south1 (Mumbai)` |
   | Encryption | Google-managed key (default) |

3. Click **Create**.

### Via CLI

```bash
gcloud artifacts repositories create pharmaops \
  --repository-format=docker \
  --location=asia-south1 \
  --project=medi-guide-7008e
```

Verify:
```bash
gcloud artifacts repositories list \
  --location=asia-south1 \
  --project=medi-guide-7008e
```

---

## Step 3 — Create Service Account

### Via GCP Console

#### 3a. Create the account

1. Open the left menu → **IAM & Admin** → **Service Accounts**.
2. Click **+ Create Service Account** and fill in:

   | Field | Value |
   |-------|-------|
   | Service account name | `pharmaops-deployer` |
   | Service account ID | `pharmaops-deployer` (auto-filled) |
   | Description | `PharmaOps GitHub Deployer` |

3. Click **Create and Continue**.

#### 3b. Assign roles

On the **Grant this service account access to project** step, add each role by clicking **+ Add another role**:

| Role |
|------|
| `Cloud Run Admin` |
| `Artifact Registry Writer` |
| `Service Account User` |
| `Secret Manager Secret Accessor` |

4. Click **Continue** → **Done**.

> Service account email: `pharmaops-deployer@medi-guide-7008e.iam.gserviceaccount.com`

### Via CLI

```bash
# Create service account
gcloud iam service-accounts create pharmaops-deployer \
  --display-name="PharmaOps GitHub Deployer" \
  --project=medi-guide-7008e

# Assign roles
SA="pharmaops-deployer@medi-guide-7008e.iam.gserviceaccount.com"

for ROLE in \
  roles/run.admin \
  roles/artifactregistry.writer \
  roles/iam.serviceAccountUser \
  roles/secretmanager.secretAccessor; do
  gcloud projects add-iam-policy-binding medi-guide-7008e \
    --member="serviceAccount:$SA" \
    --role="$ROLE"
done
```

---

## Step 4 — Set Up Workload Identity Federation

Allows GitHub Actions to authenticate with GCP without storing any JSON key file.

### Via GCP Console

#### 4a. Create a Workload Identity Pool

1. Open the left menu → **IAM & Admin** → **Workload Identity Federation**.
2. Click **+ Create Pool** and fill in:

   | Field | Value |
   |-------|-------|
   | Name | `github-pool` |
   | Pool ID | `github-pool` (auto-filled) |
   | Description | `GitHub Actions Pool` |
   | Enabled pool | ✅ On |

3. Click **Continue**.

#### 4b. Add a Provider

On the **Add a provider to pool** screen:

| Field | Value |
|-------|-------|
| Select a provider | `OpenID Connect (OIDC)` |
| Provider name | `GitHub Provider` |
| Provider ID | `github-provider` (auto-filled) |
| Issuer (URL) | `https://token.actions.githubusercontent.com` |

Click **Continue**.

#### 4c. Configure Attribute Mappings

On the **Configure provider attributes** screen, add the following mappings via **+ Add Mapping**:

| Google attribute | OIDC attribute |
|-----------------|----------------|
| `google.subject` | `assertion.sub` |
| `attribute.actor` | `assertion.actor` |
| `attribute.repository` | `assertion.repository` |

Under **Attribute Conditions**, enter:
```
attribute.repository == "nisalaperera/PharmaOps"
```

Click **Save**.

#### 4d. Grant Service Account Access

After saving, a **Grant access** dialog appears. If it doesn't:
- Click on `github-pool` in the list → click **Grant Access** at the top.

| Field | Value |
|-------|-------|
| Service account | `pharmaops-deployer@medi-guide-7008e.iam.gserviceaccount.com` |
| Select principals | `Only identities matching the filter` |
| Attribute name | `repository` |
| Attribute value | `nisalaperera/PharmaOps` |

Click **Save**.

#### 4e. Copy the WIF Provider Resource Name

This is the value for the `WIF_PROVIDER` GitHub Secret.

1. Go to **IAM & Admin** → **Workload Identity Federation**.
2. Click **`github-pool`** → click **`github-provider`**.
3. At the top of the page, find the field labeled **Resource name**. It looks like:
   ```
   projects/123456789/locations/global/workloadIdentityPools/github-pool/providers/github-provider
   ```
4. Copy the full string — paste it as the `WIF_PROVIDER` GitHub Secret in Step 6.

> The resource name uses the numeric project number, not the project ID string. This is expected.

### Via CLI

```bash
# 4a. Create identity pool
gcloud iam workload-identity-pools create github-pool \
  --location=global \
  --display-name="GitHub Actions Pool" \
  --project=medi-guide-7008e

# 4b + 4c. Create OIDC provider with attribute mapping
gcloud iam workload-identity-pools providers create-oidc github-provider \
  --location=global \
  --workload-identity-pool=github-pool \
  --display-name="GitHub Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
  --attribute-condition="attribute.repository=='nisalaperera/PharmaOps'" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --project=medi-guide-7008e

# 4d. Grant SA access to the pool
POOL_ID=$(gcloud iam workload-identity-pools describe github-pool \
  --location=global \
  --project=medi-guide-7008e \
  --format="value(name)")

gcloud iam service-accounts add-iam-policy-binding \
  "pharmaops-deployer@medi-guide-7008e.iam.gserviceaccount.com" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/${POOL_ID}/attribute.repository/nisalaperera/PharmaOps" \
  --project=medi-guide-7008e

# 4e. Get the WIF provider resource name (copy this for WIF_PROVIDER secret)
gcloud iam workload-identity-pools providers describe github-provider \
  --location=global \
  --workload-identity-pool=github-pool \
  --project=medi-guide-7008e \
  --format="value(name)"
```

---

## Step 5 — Create Secrets in Secret Manager

Sensitive values are stored in Secret Manager so they never appear as plain text in GitHub or Cloud Run.

### Via GCP Console

#### 5a. Create each secret

1. Open the left menu → **Security** → **Secret Manager**.
2. Click **+ Create Secret** and create the following 3 secrets:

---

**Secret 1 — MongoDB URL**

| Field | Value |
|-------|-------|
| Name | `pharmaops-mongodb-url` |
| Secret value | Your full MongoDB/Firestore connection string from `backend/.env` |
| Replication policy | Automatic |

Click **Create Secret**.

---

**Secret 2 — JWT Secret**

| Field | Value |
|-------|-------|
| Name | `pharmaops-jwt-secret` |
| Secret value | Your JWT secret key (minimum 32 characters) |
| Replication policy | Automatic |

Click **Create Secret**.

---

**Secret 3 — NextAuth Secret**

| Field | Value |
|-------|-------|
| Name | `pharmaops-nextauth-secret` |
| Secret value | A random 32+ character string — generate one at [generate-secret.vercel.app](https://generate-secret.vercel.app/32) |
| Replication policy | Automatic |

Click **Create Secret**.

---

#### 5b. Grant Service Account access to each secret

Repeat for **all 3 secrets**:

1. Click on the secret name → go to the **Permissions** tab.
2. Click **+ Grant Access**.
3. In **New principals**, enter: `pharmaops-deployer@medi-guide-7008e.iam.gserviceaccount.com`
4. In **Role**, select `Secret Manager Secret Accessor`.
5. Click **Save**.

#### 5c. Updating a secret value later

1. Go to **Secret Manager** → click the secret name.
2. Go to the **Versions** tab → click **+ Add New Version**.
3. Enter the new value → click **Add New Version**.

The workflow always references `:latest` which points to the newest version automatically.

### Via CLI

```bash
# Create secrets
echo -n "YOUR_MONGODB_CONNECTION_STRING" \
  | gcloud secrets create pharmaops-mongodb-url \
      --data-file=- --project=medi-guide-7008e

echo -n "YOUR_JWT_SECRET_MIN_32_CHARS" \
  | gcloud secrets create pharmaops-jwt-secret \
      --data-file=- --project=medi-guide-7008e

echo -n "YOUR_NEXTAUTH_SECRET_MIN_32_CHARS" \
  | gcloud secrets create pharmaops-nextauth-secret \
      --data-file=- --project=medi-guide-7008e

# Grant service account access to all 3 secrets
SA="pharmaops-deployer@medi-guide-7008e.iam.gserviceaccount.com"

for SECRET in pharmaops-mongodb-url pharmaops-jwt-secret pharmaops-nextauth-secret; do
  gcloud secrets add-iam-policy-binding $SECRET \
    --member="serviceAccount:$SA" \
    --role="roles/secretmanager.secretAccessor" \
    --project=medi-guide-7008e
done

# To update a secret value later:
echo -n "NEW_VALUE" \
  | gcloud secrets versions add pharmaops-jwt-secret \
      --data-file=- --project=medi-guide-7008e
```

---

## Step 6 — Configure GitHub Secrets

1. Go to `github.com/nisalaperera/PharmaOps`.
2. Click **Settings** → **Secrets and variables** → **Actions**.
3. Click **New repository secret** for each secret below.

### GCP Authentication

| Secret name | Value |
|------------|-------|
| `WIF_PROVIDER` | The resource name copied in Step 4e |
| `WIF_SERVICE_ACCOUNT` | `pharmaops-deployer@medi-guide-7008e.iam.gserviceaccount.com` |

### Backend

| Secret name | Value |
|------------|-------|
| `MONGODB_DB_NAME` | `develop` (or your production DB name) |
| `ALLOWED_ORIGINS` | Leave blank for now — fill in after Step 7 |

> `MONGODB_URL` and `JWT_SECRET` live in Secret Manager — no GitHub secret needed for these.

### Frontend — Build-time (baked into the Docker image)

| Secret name | Where to find the value |
|------------|------------------------|
| `NEXT_PUBLIC_API_URL` | Leave blank for now — fill in after Step 7 |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase Console → Project Settings → Your apps → Config |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Same Firebase config (`your-project.firebaseapp.com`) |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `medi-guide-7008e` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Same Firebase config (`your-project.appspot.com`) |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Same Firebase config |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Same Firebase config |

**How to find Firebase config values:**
1. Go to [console.firebase.google.com](https://console.firebase.google.com) → select your project.
2. Click the ⚙️ gear icon → **Project Settings**.
3. Scroll to **Your apps** → select the web app → click **Config**.
4. Copy each value from the `firebaseConfig` object.

### Frontend — Runtime (injected by Cloud Run)

| Secret name | Value |
|------------|-------|
| `NEXTAUTH_URL` | Leave blank for now — fill in after Step 7 |

> `NEXTAUTH_SECRET` lives in Secret Manager — no GitHub secret needed.

---

## Step 7 — First Deployment

### 7a. Trigger the workflow

Push to `master`, or trigger manually:
**GitHub → Actions → Deploy to Cloud Run → Run workflow → Run workflow**

The workflow will:
1. Build and push the backend Docker image to Artifact Registry
2. Deploy `pharmaops-backend` to Cloud Run
3. Build and push the frontend Docker image (Firebase vars baked in)
4. Deploy `pharmaops-frontend` to Cloud Run

Both jobs should show a green ✅ under the **Actions** tab.

### 7b. Get the Cloud Run URLs

#### Via GCP Console
1. Open the left menu → **Cloud Run**.
2. Click each service — the **URL** is shown at the top of the service details page.
   - Example: `https://pharmaops-backend-xxxxxxxxxx-as.a.run.app`

#### Via CLI
```bash
# Backend URL
gcloud run services describe pharmaops-backend \
  --region=asia-south1 --project=medi-guide-7008e \
  --format="value(status.url)"

# Frontend URL
gcloud run services describe pharmaops-frontend \
  --region=asia-south1 --project=medi-guide-7008e \
  --format="value(status.url)"
```

### 7c. Update the URL-dependent secrets

Go back to **GitHub → Settings → Secrets and variables → Actions** and update:

| Secret name | Value |
|------------|-------|
| `NEXT_PUBLIC_API_URL` | `https://<backend-url>/api/v1` |
| `NEXTAUTH_URL` | `https://<frontend-url>` |
| `ALLOWED_ORIGINS` | `https://<frontend-url>` |

Then update `ALLOWED_ORIGINS` on the live backend service immediately (so CORS works without waiting for a redeploy):

#### Via GCP Console
1. Go to **Cloud Run** → click `pharmaops-backend`.
2. Click **Edit & Deploy New Revision**.
3. Go to the **Variables & Secrets** tab.
4. Find `ALLOWED_ORIGINS` → update the value to `https://<frontend-url>`.
5. Click **Deploy**.

#### Via CLI
```bash
gcloud run services update pharmaops-backend \
  --region=asia-south1 \
  --update-env-vars="ALLOWED_ORIGINS=https://<frontend-url>" \
  --project=medi-guide-7008e
```

### 7d. Re-deploy to bake in the correct URLs

Since `NEXT_PUBLIC_API_URL` is embedded at build time, the frontend must be rebuilt after you set it:

```bash
git commit --allow-empty -m "chore: re-deploy with correct Cloud Run URLs"
git push origin master
```

Or trigger manually from the **Actions** tab → **Run workflow**.

---

## Step 8 — Verify

1. Open `https://<frontend-url>` — the login page should load.
2. Log in and confirm the dashboard works end-to-end.
3. Backend health check: open `https://<backend-url>/health`
   - Expected: `{"status":"ok","service":"PharmaOps API"}`
4. API docs: `https://<backend-url>/api/docs` (Swagger UI)

---

## Day-to-day Deployments

After the initial setup, every push to `master` automatically:
1. Builds new Docker images tagged with the Git commit SHA
2. Deploys both services with zero-downtime rolling updates

No manual steps required.

---

## Rollback

### Via GCP Console
1. Go to **Cloud Run** → click the service to roll back.
2. Go to the **Revisions** tab.
3. Click the three-dot menu (**⋮**) next to the previous stable revision → **Manage Traffic**.
4. Set that revision to **100%** traffic → click **Save**.

### Via CLI
```bash
# List revisions
gcloud run revisions list \
  --service=pharmaops-backend \
  --region=asia-south1 \
  --project=medi-guide-7008e

# Send 100% traffic to a specific revision
gcloud run services update-traffic pharmaops-backend \
  --to-revisions=pharmaops-backend-00005-xyz=100 \
  --region=asia-south1 \
  --project=medi-guide-7008e
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Frontend shows blank data or "Invalid API URL" | `NEXT_PUBLIC_API_URL` not set before build | Update GitHub secret + re-deploy |
| Login fails / NextAuth redirect loop | `NEXTAUTH_URL` doesn't match the actual frontend URL | Update GitHub secret + re-deploy |
| Backend 500 on startup | `MONGODB_URL` or `JWT_SECRET` secret missing or wrong | Check Secret Manager → verify version exists |
| GitHub Actions fails at auth step | `WIF_PROVIDER` value is wrong | Re-copy from Step 4e — must be the full `projects/…/providers/…` string |
| CORS errors in browser console | `ALLOWED_ORIGINS` on backend doesn't include frontend URL | Update env var via Console or CLI (Step 7c) |
| First request is slow (cold start) | `min-instances=0` — service scaled to zero | In `deploy.yml`, change `--min-instances=0` to `--min-instances=1` |

---

## Cost & Free Tier

All prices are for **asia-south1**. Most costs are $0 for a small pharmacy deployment.

---

### Cloud Run

Free tier is **per billing account** and shared across all Cloud Run services in all regions.

| Dimension | Free tier / month | Price after free tier |
|-----------|------------------|-----------------------|
| Requests | 2,000,000 | $0.40 / million |
| CPU | 180,000 vCPU-seconds | $0.00002400 / vCPU-second |
| Memory | 360,000 GiB-seconds | $0.00000250 / GiB-second |

**`min-instances=0` (current config)** — billed only while a request is actively being processed. No charge when idle. Cold start on first request after idle: ~2–5 seconds.

**`min-instances=1`** — billed 24/7 even with zero traffic. Eliminates cold starts but adds a fixed monthly cost:

| CPU allocation | CPU cost / month | Memory 512Mi / month | Total / service |
|---------------|-----------------|----------------------|----------------|
| 1 vCPU | ~$62 | ~$3.24 | ~$65 |
| 0.5 vCPU | ~$31 | ~$3.24 | ~$34 |

> Both services together with `min-instances=1`: **~$68–130/month** regardless of traffic.

To switch, change `--min-instances=0` to `--min-instances=1` in `.github/workflows/deploy.yml`.

---

### Artifact Registry

| Dimension | Free tier | Price after free |
|-----------|-----------|-----------------|
| Storage | 0.5 GB / project / month | $0.10 / GB / month |
| Egress within same region | Free | Free |
| Egress to internet | — | Standard GCP network egress rates |

Each Docker image is ~200–400 MB. The registry grows as old image tags accumulate with every deploy.
**Tip:** Delete unused image tags in Artifact Registry periodically to stay under the 0.5 GB free tier.

---

### Secret Manager

| Dimension | Free tier / month | Price after free |
|-----------|------------------|-----------------|
| Active secret versions | 6 | $0.06 / version / month |
| Access operations | 10,000 | $0.03 / 10,000 operations |

This deployment uses **3 secrets** — always within the 6-version free tier. **Cost: $0.**

---

### GitHub Actions

| Dimension | Public repo | Private repo free tier | After free tier |
|-----------|-------------|------------------------|----------------|
| Linux runner minutes | Unlimited | 2,000 min / month | $0.008 / minute |
| Artifact storage | Unlimited | 500 MB | $0.25 / GB / month |

Each full deploy (backend + frontend) takes ~8–15 minutes.
10 deploys/month ≈ 100–150 minutes — well within the 2,000 minute free tier for private repos.

---

### Firebase (existing — Spark / Free Plan)

| Service | Daily free limit |
|---------|-----------------|
| Firestore reads | 50,000 / day |
| Firestore writes | 20,000 / day |
| Firestore storage | 1 GiB total |
| Authentication (email/password) | Unlimited |
| Cloud Storage | 5 GB + 1 GB download / day |

No Firebase cost unless the Spark plan limits are exceeded. Upgrading to the Blaze (pay-as-you-go) plan is only needed at larger scale.

---

### IAM & Workload Identity Federation

Free — no charge for IAM policies, service accounts, or Workload Identity pools/providers.

---

### Monthly cost estimate by usage tier

| Scenario | Cloud Run | Artifact Registry | Secret Manager | GitHub Actions | **Total** |
|----------|-----------|-------------------|---------------|----------------|-----------|
| **Low** — 1–50 users, <50K req/month | $0 | $0 | $0 | $0 | **~$0** |
| **Medium** — 50–500 users, ~1M req/month | $0 | ~$0.10 | $0 | $0 | **~$0.10** |
| **High** — 500+ users, ~10M req/month | ~$6–12 | ~$0.50 | $0 | $0 | **~$7–13** |
| **Always-on** — min-instances=1, any traffic | ~$68–130 | ~$0.10 | $0 | $0 | **~$68–130** |

> For a typical multi-branch pharmacy starting out, expect **$0–1/month** until traffic grows significantly.
