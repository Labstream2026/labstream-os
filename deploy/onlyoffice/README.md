# Levantar OnlyOffice Document Server en el NAS (editar documentos en el chat/proyecto)

El código de edición ya está en la app y es seguro (callback con JWT). Solo falta
que el **Document Server** esté corriendo y que la app sepa su URL + su secreto JWT.

## 1. Generar un secreto JWT (una vez)
En el Mac o el NAS:

    openssl rand -hex 32

Guárdalo: lo usarás en DOS sitios (el Document Server y la app) y **deben coincidir**.

## 2. Preparar la carpeta en el NAS (por SSH)

    sudo mkdir -p /volume1/docker/onlyoffice/{data,logs,lib,db}
    sudo curl -fsSL "https://raw.githubusercontent.com/Labstream2026/labstream-os/main/deploy/onlyoffice/docker-compose.yml" \
      -o /volume1/docker/onlyoffice/docker-compose.yml
    # escribe el .env con el secreto (reemplaza EL_SECRETO por el del paso 1)
    echo 'ONLYOFFICE_JWT_SECRET=EL_SECRETO' | sudo tee /volume1/docker/onlyoffice/.env

## 3. Quitar el contenedor viejo (que no arranca) y levantar el nuevo

    sudo docker rm -f onlyoffice-documentserver 2>/dev/null
    cd /volume1/docker/onlyoffice
    sudo docker compose -p onlyoffice up -d

El primer arranque tarda **1–3 minutos** (inicializa su base de datos interna).
Verifica que esté sano:

    sudo docker ps | grep onlyoffice
    # debería decir (healthy) tras un par de minutos
    curl -s http://localhost:8088/healthcheck   # responde "true" cuando está listo

## 4. Conectar la app (labstream-os)
Pon estas dos líneas en `/volume1/docker/labstream-os/.env` (el secreto es el MISMO del paso 1):

    ONLYOFFICE_DOCS_URL=https://docs.labstreamsas.com
    ONLYOFFICE_JWT_SECRET=EL_SECRETO

Recrea solo el contenedor de la app (sin rebuild, solo recarga env):

    cd /volume1/docker/labstream-os
    sudo docker compose -p labstream-os up -d --no-deps --force-recreate app

## 5. Probar
En la app, en un proyecto o chat, sube un Word/Excel/PPT y pulsa **Editar**.
Debe abrir el editor de OnlyOffice y guardar solo al cerrar.

## Notas / problemas
- **El editor no carga / "Download failed":** el Document Server debe poder
  descargar el archivo desde `https://os.labstreamsas.com/api/files/...`. Asegúrate
  de que `os.labstreamsas.com` tenga un **certificado válido** (si el cert da aviso,
  el Document Server rechaza la descarga). Este es el mismo pendiente del cert de os.
- **"Token inválido":** el `ONLYOFFICE_JWT_SECRET` de la app y el `JWT_SECRET` del
  Document Server no coinciden. Deben ser idénticos.
- **El contenedor sigue sin arrancar:** revisa `sudo docker compose -p onlyoffice logs --tail 50`.
