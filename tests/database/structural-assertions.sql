-- Solo SELECT/DO en base test; falla con excepción cuando falta un invariante.
DO $$ BEGIN
 IF (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('users','products','orders','payments','sales','cash_sessions')) <> 6 THEN
  RAISE EXCEPTION 'Tablas críticas incompletas';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='only_one_open_cash_session') THEN RAISE EXCEPTION 'Falta índice caja'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='only_one_success_payment_per_order') THEN RAISE EXCEPTION 'Falta índice pago'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='users_type_fields_check') THEN RAISE EXCEPTION 'Falta CHECK tipo usuario'; END IF;
  IF (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN (
    'roles','users','pin_reset_audit','pin_recovery_tokens','categories','products','option_groups',
    'option_values','product_option_groups','product_option_values','orders','order_items',
    'order_item_options','payments','sales','cash_sessions','payment_events','refunds',
    'customer_registration_tokens','favorites','auth_sessions','auth_attempt_limits',
    'email_verification_tokens','idempotency_records','jobs','outbox_messages','payment_incidents',
    'audit_events','guest_ticket_tokens')) <> 29 THEN RAISE EXCEPTION 'Faltan tablas del modelo completo'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cash_sessions_check_3') THEN RAISE EXCEPTION 'Falta CHECK importes cierre'; END IF;
  RAISE NOTICE '29 tablas presentes; complementar con db:verify para comportamiento y concurrencia';
END $$;
