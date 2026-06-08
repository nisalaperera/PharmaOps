# Run this script once from an elevated (Admin) PowerShell to register both services.
# Requires NSSM to be on PATH: https://nssm.cc/download

$projectRoot = "F:\Project\PharmaOps"
$scriptsDir  = "$projectRoot\scripts"
$logsDir     = "$projectRoot\logs"

# Ensure logs folder exists
New-Item -ItemType Directory -Force $logsDir | Out-Null

# ── Backend ──────────────────────────────────────────────────────────────────
nssm install PharmaOps-Backend "$scriptsDir\start-backend.bat"
nssm set PharmaOps-Backend DisplayName  "PharmaOps Backend (FastAPI)"
nssm set PharmaOps-Backend AppDirectory "$projectRoot\backend\src"
nssm set PharmaOps-Backend AppStdout    "$logsDir\backend.log"
nssm set PharmaOps-Backend AppStderr    "$logsDir\backend-error.log"
nssm set PharmaOps-Backend AppRotateFiles 1
nssm set PharmaOps-Backend Start        SERVICE_AUTO_START

# ── Frontend ─────────────────────────────────────────────────────────────────
nssm install PharmaOps-Frontend "$scriptsDir\start-frontend.bat"
nssm set PharmaOps-Frontend DisplayName  "PharmaOps Frontend (Next.js)"
nssm set PharmaOps-Frontend AppDirectory "$projectRoot\frontend"
nssm set PharmaOps-Frontend AppStdout    "$logsDir\frontend.log"
nssm set PharmaOps-Frontend AppStderr    "$logsDir\frontend-error.log"
nssm set PharmaOps-Frontend AppRotateFiles 1
nssm set PharmaOps-Frontend Start        SERVICE_AUTO_START

Write-Host ""
Write-Host "Services registered. Starting them now..."
nssm start PharmaOps-Backend
nssm start PharmaOps-Frontend

Write-Host ""
Write-Host "Done. Check status with:"
Write-Host "  Get-Service PharmaOps-Backend, PharmaOps-Frontend"
