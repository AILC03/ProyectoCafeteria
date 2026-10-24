import assert from 'node:assert/strict';

// Solo se invoca desde el runner que crea una base nueva y desechable.
export async function runRegressionSuite(client, makeClient) {
  const results = [];
  async function test(name, callback) {
    try {
      await callback();
      results.push({ name, passed: true });
    } catch (error) {
      results.push({ name, passed: false, code: error.code ?? 'ASSERTION', detail: error.message });
    }
  }
  async function rejected(sql, params, code) {
    await assert.rejects(client.query(sql, params), (error) =>
      (Array.isArray(code) ? code : [code]).includes(error.code),
    );
  }
  const defaults = {
    audit_events: ['occurred_at'],
    auth_sessions: ['created_at', 'last_seen_at'],
    cash_sessions: ['opened_at'],
    categories: ['created_at'],
    customer_registration_tokens: ['created_at'],
    favorites: ['created_at'],
    guest_ticket_tokens: ['created_at'],
    idempotency_records: ['created_at'],
    jobs: ['available_at'],
    orders: ['created_at'],
    outbox_messages: ['available_at'],
    payment_events: ['received_at'],
    payment_incidents: ['created_at'],
    payments: ['created_at'],
    pin_recovery_tokens: ['created_at'],
    pin_reset_audit: ['reset_at'],
    products: ['created_at'],
    refunds: ['created_at'],
    sales: ['sold_at'],
    users: ['created_at'],
  };
  await test('C01: los 21 defaults de fecha existen en SQL', async () => {
    const { rows } = await client.query(
      "SELECT table_name, column_name, column_default FROM information_schema.columns WHERE table_schema='public'",
    );
    for (const [table, columns] of Object.entries(defaults)) {
      for (const column of columns) {
        const found = rows.find((row) => row.table_name === table && row.column_name === column);
        assert.match(found?.column_default ?? '', /CURRENT_TIMESTAMP|now\(\)/i);
      }
    }
  });
  await test('C01: insertar categoría sin fecha asigna timestamp', async () => {
    const { rows } = await client.query(
      "INSERT INTO categories(name) VALUES ('Default automático') RETURNING created_at",
    );
    assert.ok(rows[0].created_at instanceof Date);
  });

  // Fixtures explícitos: permiten seguir diagnosticando C02-C04 incluso en el mutante sin defaults.
  await client.query(`
    INSERT INTO roles(id,name) VALUES (1,'CLIENTE'),(2,'CAJERO'),(3,'ADMINISTRADOR');
    INSERT INTO users(id,account_type,role_id,name,username,password_hash,created_at,updated_at)
      VALUES (1,'STAFF',2,'Cajero prueba','review.cashier','hash-ficticio',now(),now());
    INSERT INTO users(id,account_type,role_id,name,customer_number,phone,pin_hash,created_at,updated_at)
      VALUES (2,'CUSTOMER',1,'Cliente prueba','C000002','+526641234567','hash-ficticio',now(),now());
    INSERT INTO categories(id,name,created_at) VALUES (100,'Pruebas',now());
    INSERT INTO products(id,category_id,name,base_price_cents,created_at,updated_at)
      VALUES (100,100,'Latte',6500,now(),now());
    INSERT INTO cash_sessions(id,employee_id,opening_amount_cents,opened_at) VALUES (100,1,50000,now());
    INSERT INTO orders(id,folio,source,payment_method,total_cents,payment_expires_at,cash_qr_token_hash,created_at,updated_at)
      VALUES (100,'REVIEW-CASH','MOBILE','CASH',6500,now()+interval '30 minutes',repeat('a',64),now(),now());
    INSERT INTO orders(id,folio,source,payment_method,total_cents,payment_expires_at,created_at,updated_at)
      VALUES (101,'REVIEW-STRIPE','MOBILE','STRIPE',6500,now()+interval '30 minutes',now(),now());
  `);
  for (const table of ['roles', 'users', 'categories', 'products', 'cash_sessions', 'orders']) {
    await client.query(
      `SELECT setval(pg_get_serial_sequence('${table}','id'), (SELECT max(id) FROM ${table}))`,
    );
  }
  const cash = (change) =>
    client.query(
      `INSERT INTO payments(order_id,method,amount_cents,cashier_id,cash_session_id,cash_received_cents,change_cents,created_at,updated_at)
    VALUES(100,'CASH',6500,1,100,10000,$1,now(),now())`,
      [change],
    );
  await test('C02: efectivo rechaza cambio NULL', () =>
    assert.rejects(cash(null), (e) => e.code === '23514'));
  await test('C02: efectivo rechaza cambio incorrecto', () =>
    assert.rejects(cash(1), (e) => e.code === '23514'));
  await test('C02: efectivo acepta cambio 3500', () => cash(3500));
  await test('C02: Stripe acepta campos efectivo NULL', () =>
    client.query(
      "INSERT INTO payments(order_id,method,amount_cents,created_at,updated_at) VALUES(101,'STRIPE',6500,now(),now())",
    ));
  const close = (expected, counted, difference) =>
    client.query(
      `UPDATE cash_sessions SET closed_at=now(),closed_by_employee_id=1,
    expected_cash_cents=$1,counted_cash_cents=$2,difference_cents=$3 WHERE id=100`,
      [expected, counted, difference],
    );
  await test('C03: cierre rechaza diferencia NULL', () =>
    assert.rejects(close(50000, 49000, null), (e) => e.code === '23514'));
  await test('C03: cierre rechaza diferencia incorrecta', () =>
    assert.rejects(close(50000, 49000, 0), (e) => e.code === '23514'));
  await test('C04: cierre rechaza importes negativos', () =>
    assert.rejects(close(-100, -100, 0), (e) => e.code === '23514'));
  await test('C03: cierre sin actor se rechaza', () =>
    rejected(
      'UPDATE cash_sessions SET closed_at=now(),expected_cash_cents=0,counted_cash_cents=0,difference_cents=0 WHERE id=100',
      [],
      '23514',
    ));
  await test('C03: cierre completo admite diferencia negativa', () => close(50000, 49000, -1000));
  await test('FK: producto de categoría inexistente se rechaza', () =>
    rejected(
      "INSERT INTO products(category_id,name,base_price_cents,created_at,updated_at) VALUES(-1,'Inválido',1,now(),now())",
      [],
      '23503',
    ));
  await test('CHECK: precio negativo se rechaza', () =>
    rejected('UPDATE products SET base_price_cents=-1 WHERE id=100', [], '23514'));
  await test('CHECK: usuario híbrido se rechaza', () =>
    rejected("UPDATE users SET phone='+526640000000' WHERE id=1", [], '23514'));
  await test('CHECK: cantidad cero se rechaza', () =>
    rejected(
      "INSERT INTO order_items(order_id,product_id,product_name_snapshot,base_price_cents_snapshot,unit_price_cents,quantity,line_total_cents) VALUES(100,100,'Latte',6500,6500,0,0)",
      [],
      '23514',
    ));
  await test('Historial: cambiar catálogo conserva snapshot', async () => {
    await client.query(
      "INSERT INTO order_items(id,order_id,product_id,product_name_snapshot,base_price_cents_snapshot,unit_price_cents,quantity,line_total_cents) VALUES(100,100,100,'Latte',6500,6500,1,6500)",
    );
    await client.query('UPDATE products SET base_price_cents=7000,deleted_at=now() WHERE id=100');
    const { rows } = await client.query('SELECT unit_price_cents FROM order_items WHERE id=100');
    assert.equal(rows[0].unit_price_cents, '6500');
  });
  await test('FK: categoría con producto retirado no se borra', () =>
    rejected('DELETE FROM categories WHERE id=100', [], ['23503', '23001']));
  await test('Rollback: error intermedio revierte cambios previos', async () => {
    await client.query('BEGIN');
    try {
      await client.query("UPDATE products SET name='No debe persistir' WHERE id=100");
      await assert.rejects(client.query('UPDATE products SET base_price_cents=-1 WHERE id=100'));
    } finally {
      await client.query('ROLLBACK');
    }
    const { rows } = await client.query('SELECT name FROM products WHERE id=100');
    assert.equal(rows[0].name, 'Latte');
  });
  async function race(sql, params = []) {
    const clients = [makeClient(), makeClient()];
    try {
      await Promise.all(clients.map((c) => c.connect()));
      const outcomes = await Promise.allSettled(clients.map((c) => c.query(sql, params)));
      assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1);
      const failure = outcomes.find((r) => r.status === 'rejected');
      assert.equal(failure?.reason.code, '23505');
    } finally {
      await Promise.all(clients.map((c) => c.end()));
    }
  }
  await test('Concurrencia: solo una apertura global', () =>
    race(
      'INSERT INTO cash_sessions(employee_id,opening_amount_cents,opened_at) VALUES(1,0,now())',
    ));
  await test('Concurrencia: solo un pago exitoso por orden', () =>
    race(
      "INSERT INTO payments(order_id,method,status,amount_cents,confirmed_at,created_at,updated_at) VALUES(101,'STRIPE','SUCCEEDED',6500,now(),now(),now())",
    ));
  await test('UNIQUE: venta duplicada se rechaza', async () => {
    const { rows } = await client.query(
      "SELECT id FROM payments WHERE order_id=101 AND status='SUCCEEDED'",
    );
    await client.query(
      "INSERT INTO sales(sale_number,order_id,payment_id,total_cents,sold_at) VALUES('REVIEW-SALE',101,$1,6500,now())",
      [rows[0].id],
    );
    await rejected(
      "INSERT INTO sales(sale_number,order_id,payment_id,total_cents,sold_at) VALUES('REVIEW-DUP',101,$1,6500,now())",
      [rows[0].id],
      '23505',
    );
  });
  // Inserciones omitien defaults: completan prueba de todas las columnas C01.
  await test('C01: omitir las fechas de las tablas de soporte funciona', async () => {
    const payment = (await client.query("SELECT id FROM payments WHERE status='SUCCEEDED' LIMIT 1"))
      .rows[0].id;
    const sale = (await client.query('SELECT id FROM sales LIMIT 1')).rows[0].id;
    await client.query(`
      INSERT INTO audit_events(actor_id,action,reason) VALUES(1,'REVIEW','Prueba');
      INSERT INTO auth_sessions(user_id,family_id,refresh_token_hash,absolute_expires_at) VALUES(2,'00000000-0000-4000-8000-000000000001',repeat('b',64),now()+interval '1 day');
      INSERT INTO favorites(customer_id,product_id) VALUES(2,100);
      INSERT INTO idempotency_records(scope,actor_key,key_hash,request_hash,expires_at) VALUES('review','2',repeat('c',64),repeat('d',64),now()+interval '2 days');
      INSERT INTO jobs(type,reference) VALUES('review','1');
      INSERT INTO outbox_messages(type,reference) VALUES('review','1');
      INSERT INTO payment_events(provider_event_id,event_type) VALUES('evt_review','review');
      INSERT INTO payment_incidents(order_id,reason) VALUES(101,'review');
      INSERT INTO pin_recovery_tokens(customer_id,token_hash,expires_at) VALUES(2,repeat('e',64),now()+interval '30 minutes');
      INSERT INTO pin_reset_audit(customer_id,admin_id,reason,verification_summary) VALUES(2,1,'review','Ficticio; rol se valida en servicio');
    `);
    await client.query(
      "INSERT INTO refunds(payment_id,amount_cents,reason,updated_at) VALUES($1,6500,'review',now())",
      [payment],
    );
    await client.query(
      "INSERT INTO customer_registration_tokens(sale_id,token_hash,expires_at) VALUES($1,repeat('f',64),now()+interval '1 day')",
      [sale],
    );
    await client.query(
      "INSERT INTO guest_ticket_tokens(sale_id,token_hash,expires_at) VALUES($1,repeat('0',64),now()+interval '1 day')",
      [sale],
    );
    await client.query(
      "INSERT INTO users(account_type,role_id,name,username,password_hash,updated_at) VALUES('STAFF',2,'Default','review.defaults','hash-ficticio',now())",
    );
    await client.query(
      "INSERT INTO products(category_id,name,base_price_cents,updated_at) VALUES(100,'Default',1,now())",
    );
    await client.query(
      "INSERT INTO orders(folio,source,payment_method,total_cents,payment_expires_at,updated_at) VALUES('REVIEW-DEFAULT','MOBILE','STRIPE',1,now()+interval '30 minutes',now())",
    );
    await client.query(
      "INSERT INTO payments(order_id,method,status,amount_cents,confirmed_at,updated_at) SELECT id,'STRIPE','SUCCEEDED',1,now(),now() FROM orders WHERE folio='REVIEW-DEFAULT'",
    );
    await client.query(
      "INSERT INTO sales(sale_number,order_id,payment_id,total_cents) SELECT 'REVIEW-DEFAULT',o.id,p.id,1 FROM orders o JOIN payments p ON p.order_id=o.id AND p.status='SUCCEEDED' WHERE o.folio='REVIEW-DEFAULT'",
    );
  });
  return results;
}
