// functions/src/validators.js
// ─────────────────────────────────────────────────────────────
// Input validation helpers shared across all functions.
// Adding a new validation = add a function here only.
// ─────────────────────────────────────────────────────────────

const functions = require('firebase-functions');
const crypto    = require('crypto');

const SECRET_KEY = () => process.env.QR_HMAC_SECRET || functions.config().qr?.hmac_secret;

/**
 * Validates and parses a QR token payload.
 * QR payload structure: JSON stringified { studentId, schoolId, token }
 * where token = HMAC-SHA256(studentId:schoolId, SECRET_KEY)
 * @returns {{ studentId: string, schoolId: string }}
 * @throws FirebaseError on invalid/tampered token
 */
function validateQRToken(rawToken) {
  let payload;
  try {
    payload = JSON.parse(rawToken);
  } catch {
    throw new functions.https.HttpsError(
      'invalid-argument', 'QR payload is not valid JSON.'
    );
  }

  const { studentId, schoolId, token } = payload;
  if (!studentId || !schoolId || !token) {
    throw new functions.https.HttpsError(
      'invalid-argument', 'QR payload is missing required fields.'
    );
  }

  const expected = crypto
    .createHmac('sha256', SECRET_KEY())
    .update(`${studentId}:${schoolId}`)
    .digest('hex');

  const tokenBuffer = Buffer.from(token);
  const expectedBuffer = Buffer.from(expected);
  if (
    tokenBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(tokenBuffer, expectedBuffer)
  ) {
    throw new functions.https.HttpsError(
      'invalid-argument', 'QR token signature is invalid.'
    );
  }

  return { studentId, schoolId };
}

/**
 * Validates manual override input from admin.
 */
function validateManualEntry({ studentId, date, slot, status }) {
  const validSlots    = ['morning', 'afternoon'];
  const validStatuses = ['present', 'absent', 'partial'];

  if (!studentId) throw new functions.https.HttpsError('invalid-argument', 'studentId required.');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new functions.https.HttpsError('invalid-argument', 'date must be YYYY-MM-DD.');
  if (!validSlots.includes(slot))
    throw new functions.https.HttpsError('invalid-argument', `slot must be one of: ${validSlots.join(', ')}.`);
  if (!validStatuses.includes(status))
    throw new functions.https.HttpsError('invalid-argument', `status must be one of: ${validStatuses.join(', ')}.`);
}

module.exports = { validateQRToken, validateManualEntry };
