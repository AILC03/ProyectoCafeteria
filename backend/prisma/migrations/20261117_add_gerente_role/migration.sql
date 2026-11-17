-- Insertar rol GERENTE para supervisión y reportes de solo lectura conforme al documento funcional
INSERT INTO "roles" ("name") VALUES ('GERENTE') ON CONFLICT ("name") DO NOTHING;
