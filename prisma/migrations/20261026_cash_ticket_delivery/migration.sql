-- Aditiva. Mantener token_hash como identidad para el futuro consumo de un uso.
-- Recuperación del QR para impresión/reintento sin almacenar original en claro.
ALTER TABLE "customer_registration_tokens"
  ADD COLUMN "encrypted_payload" TEXT,
  ADD COLUMN "key_version" VARCHAR(32),
  ADD CONSTRAINT "customer_registration_tokens_delivery_pair_check"
    CHECK ((encrypted_payload IS NULL) = (key_version IS NULL));
CREATE INDEX "customer_registration_tokens_expires_at_idx" ON "customer_registration_tokens" (expires_at);
