@echo off
title Coffee's POS - Modo Produccion (Preview)
color 0A
echo ======================================================
echo        COFFEE'S POS - MODO PRODUCCION (PREVIEW)
echo ======================================================
echo.

cd /d "%~dp0"

echo [1/3] Verificando instalacion de Node.js...
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Node.js no esta instalado o no se encuentra en el PATH.
    echo Por favor descarga e instala Node.js desde: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo [2/3] Compilando proyecto para produccion (build)...
call npm run build
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] La compilacion fallo.
    pause
    exit /b 1
)
echo.

echo [3/3] Iniciando servidor de produccion local...
echo Para detener la aplicacion, presiona Ctrl + C en esta ventana.
echo.
call npm run preview -- --open

pause
