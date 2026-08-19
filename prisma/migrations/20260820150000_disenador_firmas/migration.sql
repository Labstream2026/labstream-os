-- El diseñador de firmas: la plantilla guarda el estado del formulario (layout, acento,
-- empresa, redes…) y el html se REGENERA desde ahí al guardar. null = plantilla en HTML.
ALTER TABLE "MailSignatureTemplate" ADD COLUMN "config" JSONB;
