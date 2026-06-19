@echo off
cd /d F:\Project\PharmaOps\frontend
npm run build:local && "C:\Program Files\nodejs\node.exe" --env-file=.env .next\standalone\server.js
