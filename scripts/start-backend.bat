@echo off
cd /d F:\Project\PharmaOps\backend\src

set PYTHONPATH=F:\Project\PharmaOps\backend\src
set PYTHONUSERBASE=C:\Users\ABC\AppData\Roaming\Python
set PYTHONUSERSITE=1

"C:\Program Files\Python312\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 8001
