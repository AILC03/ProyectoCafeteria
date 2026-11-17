// ==========================================================================
// Coffee´s Pos - Utilidades Criptográficas (Hash de Contraseñas y PINs)
// Implementación síncrona compatible con Navegador, Electron (file://) y Node
// ==========================================================================

const HASH_PREFIX = '$coffeespos$v1$';
const LEGACY_HASH_PREFIX = '$taffy$v1$';
const ITERATIONS = 1024;

// Constantes estándar FIPS 180-4 para SHA-256
const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

function rightRotate(value, amount) {
  return (value >>> amount) | (value << (32 - amount));
}

// Implementación estándar SHA-256 (UTF-8 -> Hex)
export function sha256Hex(asciiInput) {
  const utf8 = unescape(encodeURIComponent(String(asciiInput)));
  const words = [];
  const asciiBitLength = utf8.length * 8;

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  for (let i = 0; i < utf8.length; i++) {
    words[i >> 2] |= (utf8.charCodeAt(i) & 0xff) << (24 - (i % 4) * 8);
  }
  words[utf8.length >> 2] |= 0x80 << (24 - (utf8.length % 4) * 8);
  words[(((utf8.length + 8) >> 6) << 4) + 15] = asciiBitLength;

  const w = new Array(64);

  for (let j = 0; j < words.length; j += 16) {
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      if (i < 16) {
        w[i] = words[j + i] | 0;
      } else {
        const gamma0x = w[i - 15];
        const gamma0 = rightRotate(gamma0x, 7) ^ rightRotate(gamma0x, 18) ^ (gamma0x >>> 3);
        const gamma1x = w[i - 2];
        const gamma1 = rightRotate(gamma1x, 17) ^ rightRotate(gamma1x, 19) ^ (gamma1x >>> 10);
        w[i] = (w[i - 16] + gamma0 + w[i - 7] + gamma1) | 0;
      }

      const ch = (e & f) ^ (~e & g);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const sigma0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const sigma1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);

      const t1 = (h + sigma1 + ch + K[i] + w[i]) | 0;
      const t2 = (sigma0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }

    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
    h5 = (h5 + f) | 0;
    h6 = (h6 + g) | 0;
    h7 = (h7 + h) | 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((v) => (v >>> 0).toString(16).padStart(8, '0'))
    .join('');
}

// Comprueba si un valor ya se encuentra hasheado
export function isHashed(value) {
  if (!value || typeof value !== 'string') return false;
  return value.startsWith(HASH_PREFIX) || value.startsWith(LEGACY_HASH_PREFIX) || value.startsWith('$coffeespos$scrypt$') || value.startsWith('$taffy$scrypt$');
}

// Comparación en tiempo constante para evitar ataques de timing
export function constantTimeEqual(a, b) {
  const strA = String(a || '');
  const strB = String(b || '');
  if (strA.length !== strB.length) return false;
  let result = 0;
  for (let i = 0; i < strA.length; i++) {
    result |= strA.charCodeAt(i) ^ strB.charCodeAt(i);
  }
  return result === 0;
}

// Deriva un hash con sal y estiramiento de clave (Key Stretching)
export function hashSecret(plainText, contextSalt = 'default') {
  const raw = String(plainText || '').trim();
  if (!raw) return '';
  if (isHashed(raw)) return raw;

  const cleanSalt = sha256Hex(`coffees_salt_v1:${String(contextSalt).trim().toLowerCase()}`).slice(0, 24);
  let digest = sha256Hex(`${cleanSalt}:${raw}`);
  for (let i = 0; i < ITERATIONS; i++) {
    digest = sha256Hex(`${digest}:${cleanSalt}:${raw}:${i}`);
  }
  return `${HASH_PREFIX}${cleanSalt}$${digest}`;
}

// Verifica un secreto (contraseña o PIN) contra un hash almacenado (con soporte retrocompatible)
export function verifySecret(plainText, storedValue, contextSalt = 'default') {
  const candidate = String(plainText || '').trim();
  const stored = String(storedValue || '').trim();
  if (!candidate || !stored) return false;

  // Si aún no estaba hasheado (datos legacy), comparar en tiempo constante
  if (!isHashed(stored)) {
    return constantTimeEqual(candidate, stored);
  }

  const prefix = stored.startsWith(HASH_PREFIX)
    ? HASH_PREFIX
    : (stored.startsWith(LEGACY_HASH_PREFIX) ? LEGACY_HASH_PREFIX : null);

  if (prefix) {
    const parts = stored.slice(prefix.length).split('$');
    if (parts.length !== 2) return false;
    const [salt] = parts;
    let digest = sha256Hex(`${salt}:${candidate}`);
    for (let i = 0; i < ITERATIONS; i++) {
      digest = sha256Hex(`${digest}:${salt}:${candidate}:${i}`);
    }
    const expected = `${prefix}${salt}$${digest}`;
    return constantTimeEqual(expected, stored);
  }

  return false;
}

// Helpers específicos para PIN de empleado y Contraseña de cuenta (Tenant)
export function hashEmployeePin(pin, tenantId = '', employeeId = '') {
  const saltContext = `pin:${String(tenantId || 'local').trim().toLowerCase()}:${String(employeeId || '').trim()}`;
  return hashSecret(pin, saltContext);
}

export function verifyEmployeePin(pinInput, storedPinOrHash, tenantId = '', employeeId = '') {
  const saltContext = `pin:${String(tenantId || 'local').trim().toLowerCase()}:${String(employeeId || '').trim()}`;
  return verifySecret(pinInput, storedPinOrHash, saltContext);
}

export function hashAccountPassword(password, email = '') {
  const saltContext = `account:${String(email || '').trim().toLowerCase()}`;
  return hashSecret(password, saltContext);
}

export function verifyAccountPassword(passwordInput, storedPasswordOrHash, email = '') {
  const saltContext = `account:${String(email || '').trim().toLowerCase()}`;
  return verifySecret(passwordInput, storedPasswordOrHash, saltContext);
}
