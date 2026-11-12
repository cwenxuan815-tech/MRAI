@echo off
setlocal

rem ============================================================
rem  Start EVP services
rem    - Backend  : FastAPI + Uvicorn on 0.0.0.0:8000
rem    - Frontend : Vite dev server on 0.0.0.0:5173
rem  Each service gets its own window so logs stay readable.
rem  Use stop.bat to shut both down.
rem ============================================================

set "ROOT=%~dp0"
set "BACKEND_DIR=%ROOT%backend"
set "FRONTEND_DIR=%ROOT%frontend"
set "PY=%BACKEND_DIR%\.venv\Scripts\python.exe"
set "NODE_DIR=%ROOT%.tools\node"

if not exist "%PY%" (
    echo [ERROR] Python venv not found: %PY%
    pause
    exit /b 1
)

if not exist "%NODE_DIR%\node.exe" (
    echo [ERROR] Portable Node not found: %NODE_DIR%\node.exe
    pause
    exit /b 1
)

rem ---------------- Backend ----------------
call :is_listening 8000
if "%LISTENING%"=="1" (
    echo [SKIP]  Backend already running on port 8000
) else (
    echo [START] Backend  --^> http://127.0.0.1:8000
    start "EVP-Backend-8000" /D "%BACKEND_DIR%" cmd /k ""%PY%" -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
)

rem ---------------- Frontend ----------------
call :is_listening 5173
if "%LISTENING%"=="1" (
    echo [SKIP]  Frontend already running on port 5173
) else (
    echo [START] Frontend --^> http://localhost:5173/patient/upload
    start "EVP-Frontend-5173" /D "%FRONTEND_DIR%" cmd /k ""%NODE_DIR%\node.exe" node_modules\vite\bin\vite.js"
)

echo.
echo Done. Run stop.bat to shut both services down.
timeout /t 6 >nul
exit /b 0

:is_listening
set "LISTENING=0"
for /f "tokens=5" %%A in ('netstat -ano ^| findstr /C:":%~1 " ^| findstr /C:"LISTENING"') do set "LISTENING=1"
exit /b 0
