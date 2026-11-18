-- Aditiva: originales recuperables para QR CASH; no alterar hashes/históricos previos.
ALTER TABLE "orders"
  ADD COLUMN "cash_qr_encrypted_payload" TEXT,
  ADD COLUMN "cash_qr_key_version" VARCHAR(32),
  ADD CONSTRAINT "orders_cash_qr_payload_pair_check"
    CHECK ((cash_qr_encrypted_payload IS NULL) = (cash_qr_key_version IS NULL)),
  ADD CONSTRAINT "orders_cash_qr_payload_method_check"
    CHECK (cash_qr_encrypted_payload IS NULL OR payment_method = 'CASH');
