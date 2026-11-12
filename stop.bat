@echo off
setlocal

rem ============================================================
rem  Stop EVP services
rem    1) close the windows opened by start.bat (kills the whole tree)
rem    2) kill by command line  -- also handles the uvicorn --reload
rem       parent process, which respawns the worker if left alive
rem    3) fallback: kill whatever still occupies port 5173 / 8000
rem ============================================================

echo Stopping EVP services...
echo.

rem ---- 1) close service windows opened by start.bat ----
taskkill /FI "WINDOWTITLE eq EVP-Backend-8000*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq EVP-Frontend-5173*" /T /F >nul 2>&1

rem ---- 2) kill by command line ----
call :kill_cmdline "*uvicorn*main:app*"
call :kill_cmdline "*vite*bin*vite.js*"

rem ---- 3) fallback: kill by listening port ----
call :kill_port 5173 "Frontend"
call :kill_port 8000 "Backend"

rem ---- 4) verify ----
timeout /t 2 >nul
echo.
call :check 5173 "Frontend"
call :check 8000 "Backend"
echo.
pause
exit /b 0


:kill_cmdline
rem  Kill processes whose command line matches the given pattern.
rem  $self is excluded so this script never matches its own PowerShell.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$self=$PID; $procs=Get-CimInstance Win32_Process; foreach($p in $procs){ if($p.ProcessId -ne $self -and $p.CommandLine -like '%~1'){ taskkill /PID $p.ProcessId /T /F } }" >nul 2>&1
exit /b 0


:kill_port
for /f "tokens=5" %%A in ('netstat -ano ^| findstr /C:":%~1 " ^| findstr /C:"LISTENING"') do (
    echo [KILL]  %~2 still up on port %~1 -- terminating PID %%A
    taskkill /PID %%A /T /F >nul 2>&1
)
exit /b 0


:check
set "STILL=0"
for /f "tokens=5" %%A in ('netstat -ano ^| findstr /C:":%~1 " ^| findstr /C:"LISTENING"') do set "STILL=1"
if "%STILL%"=="1" (
    echo [WARN]  %~2 port %~1 is STILL in use.
    echo         Its process belongs to another user / elevated session.
    echo         Close its window manually, or re-run stop.bat as Administrator.
) else (
    echo [OK]    %~2 stopped, port %~1 is free
)
exit /b 0
