-- FIN-01: aditiva; nunca aplicada automáticamente sobre bases del proyecto.
ALTER TABLE orders ADD COLUMN checkout_token_hash CHAR(64), ADD COLUMN checkout_encrypted_payload TEXT, ADD COLUMN checkout_key_version VARCHAR(32);
CREATE UNIQUE INDEX orders_checkout_token_hash_key ON orders(checkout_token_hash);
ALTER TABLE orders ADD CONSTRAINT orders_checkout_delivery_check CHECK (
  (checkout_encrypted_payload IS NULL AND checkout_key_version IS NULL) OR
  (payment_method='STRIPE' AND checkout_token_hash IS NOT NULL AND checkout_encrypted_payload IS NOT NULL AND checkout_key_version IS NOT NULL));
ALTER TABLE payments ADD COLUMN stripe_checkout_url VARCHAR(2048), ADD COLUMN stripe_expires_at TIMESTAMPTZ(6);
ALTER TABLE payment_events ADD COLUMN checkout_session_id VARCHAR(255);
ALTER TABLE jobs ADD COLUMN lease_token UUID;
ALTER TABLE outbox_messages ADD COLUMN lease_token UUID;
CREATE UNIQUE INDEX payments_one_pending_stripe_per_order ON payments(order_id) WHERE method='STRIPE' AND status='PENDING';
