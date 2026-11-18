:: ===================================================================
::  CONFIGURACION DE URL FIJA HTTPS PARA CLIENTES (INSTALABLE / PWA)
:: ===================================================================
::
:: Para activar tu URL fija, renombra este archivo a 'tunel-config.bat'
:: y elige una de las dos opciones:
::
:: -------------------------------------------------------------------
:: OPCION 1 (RECOMENDADA): NGROK CON DOMINIO FIJO GRATUITO
:: 1. Registrate gratis en https://ngrok.com y crea tu dominio gratis
:: 2. Instala ngrok en tu PC (ej: winget install ngrok o desde ngrok.com)
:: 3. Descomenta y escribe tu dominio aqui:
:: set "NGROK_DOMAIN=mi-cafeteria-pos.ngrok-free.app"

:: -------------------------------------------------------------------
:: OPCION 2 (INMEDIATA SIN CUENTA): LOCALTUNNEL
:: No requiere registro. Solo descomenta la siguiente linea y escribe
:: el subdominio que quieras (debe ser unico):
:: set "LOCALTUNNEL_SUBDOMAIN=coffees-pos-clientes"
