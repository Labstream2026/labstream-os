@echo off
REM Doble clic AQUI para revisar por que el panel no aparece. NO instala nada, solo informa.
REM Copia lo que salga y enviaselo a quien te dio el plugin.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0diagnostico-windows.ps1"
