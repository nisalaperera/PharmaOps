@echo off
cd /d F:\Project\PharmaOps\backend\src
set PYTHONPATH=F:\Project\PharmaOps\backend\src
python -m uvicorn app.main:app --host 0.0.0.0 --port 8080
