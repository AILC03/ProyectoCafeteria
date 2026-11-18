@echo off
title Coffee's POS - Iniciar Sistema Completo
color 0A
chcp 65001 >nul
cls

echo ===================================================================
echo                     COFFEE'S POS - SISTEMA COMPLETO
echo ===================================================================
echo.
cd /d "%~dp0"

:: 1. Asegurar PATH a Node.js y Docker
set "PATH=C:\Program Files\nodejs;C:\Program Files\Docker\Docker\resources\bin;%PATH%"

:: 2. Deteccion de IP Local
set "IP_LOCAL=localhost"
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4" ^| findstr /v "192.168.56." ^| findstr /v "172."') do (
    for /f "tokens=1" %%b in ("%%a") do set "IP_LOCAL=%%b"
)

:: 3. Verificar Docker y PostgreSQL
echo [1/4] Verificando Docker y Base de Datos...
docker ps >nul 2>&1
if %errorlevel% equ 0 goto docker_listo

echo [INFO] Docker Desktop no esta activo. Intentando abrir Docker Desktop...
start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
echo Esperando a que el motor de Docker responda...

set intentos=0
:esperar_docker
timeout /t 3 /nobreak >nul
docker ps >nul 2>&1
if %errorlevel% equ 0 goto docker_listo
set /a intentos+=1
if %intentos% geq 15 goto docker_fallo
goto esperar_docker

:docker_fallo
color 0C
echo.
echo [ERROR] Docker no respondio a tiempo.
echo Por favor abre Docker Desktop manualmente y vuelve a ejecutar este archivo.
echo.
pause
exit /b 1

:docker_listo
echo [INFO] Iniciando contenedor PostgreSQL...
cd backend
call npm.cmd run db:up
call npx.cmd prisma migrate deploy
cd ..

:: 4. Levantar Servicios
echo.
echo [2/4] Iniciando Backend API (Puerto 3000)...
start "Backend API (Puerto 3000)" cmd /k "title Backend API && cd /d %~dp0backend && npm.cmd run dev"

echo [3/4] Iniciando Frontend Clientes (Puerto 5173)...
start "Frontend Clientes (Puerto 5173)" cmd /k "title Frontend Clientes && cd /d %~dp0frontend\clientes && npm.cmd run dev"

echo [4/4] Iniciando Frontend Empleados / POS (Puerto 5174)...
start "Frontend Empleados / POS (Puerto 5174)" cmd /k "title Frontend Empleados && cd /d %~dp0frontend\empleados && npm.cmd run dev"

:: 5. Verificar si existe configuracion de Tunel Fijo
set "DOMINIO_CLIENTES_HTTPS="
if exist "%~dp0tunel-config.bat" call "%~dp0tunel-config.bat"

if defined NGROK_DOMAIN (
    echo [*] Iniciando Tunel HTTPS Fijo (Ngrok)...
    start "Tunel Clientes Ngrok" cmd /k "title Tunel Clientes && ngrok http 5173 --domain=%NGROK_DOMAIN%"
    set "DOMINIO_CLIENTES_HTTPS=https://%NGROK_DOMAIN%"
) else (
    if defined LOCALTUNNEL_SUBDOMAIN (
        echo [*] Iniciando Tunel HTTPS Fijo (Localtunnel)...
        start "Tunel Clientes Localtunnel" cmd /k "title Tunel Clientes && npx.cmd localtunnel --port 5173 --subdomain %LOCALTUNNEL_SUBDOMAIN%"
        set "DOMINIO_CLIENTES_HTTPS=https://%LOCALTUNNEL_SUBDOMAIN%.loca.lt"
    )
)

:: 6. Mostrar URLs fijas y limpias
cls
color 0B
echo ===================================================================
echo               COFFEE'S POS - SERVICIOS ACTIVOS
echo ===================================================================
echo.
echo  -----------------------------------------------------------------
echo   1. PAGINA PARA EMPLEADOS (POS / Caja / Mostrador):
echo  -----------------------------------------------------------------
echo      - En esta computadora:  http://localhost:5174
echo      - En tablet de caja:    http://%IP_LOCAL%:5174
echo.
echo  -----------------------------------------------------------------
echo   2. PAGINA PARA CLIENTES (Carta Digital y Pedidos):
echo  -----------------------------------------------------------------
if defined DOMINIO_CLIENTES_HTTPS (
echo      - URL FIJA PARA CLIENTES (HTTPS - ¡INSTALABLE EN CELULARES!):
echo        %DOMINIO_CLIENTES_HTTPS%
echo.
echo      - Acceso por Red Local Wi-Fi:
echo        http://%IP_LOCAL%:5173
) else (
echo      - Acceso por Red Local Wi-Fi:
echo        http://%IP_LOCAL%:5173
echo.
echo      - URL FIJA HTTPS (Para que los clientes puedan instalar la App):
echo        Crea 'tunel-config.bat' a partir de 'tunel-config.example.bat'
)
echo.
echo  -----------------------------------------------------------------
echo   3. BACKEND API:
echo  -----------------------------------------------------------------
echo      - Estado:               http://localhost:3000/api/v1/health
echo.
echo ===================================================================
echo  Los servidores estan ejecutandose en sus ventanas correspondientes.
echo  Puedes minimizar esta ventana.
echo ===================================================================
echo.
pause
