// functions/src/generateQR.js
// ─────────────────────────────────────────────────────────────
// Generates an HMAC-signed QR code PNG for a student.
// Stores it in Firebase Storage and updates the student doc.
// ─────────────────────────────────────────────────────────────

const functions = require('firebase-functions');
const admin     = require('firebase-admin');
const crypto    = require('crypto');
const QRCode    = require('qrcode');
const { getStudent, studentRef } = require('./firestoreHelpers');

const SECRET_KEY = () =>
  process.env.QR_HMAC_SECRET || functions.config().qr?.hmac_secret;

const generateQR = functions
  .region('asia-south1')
  .https.onCall(async (data, context) => {
    // Auth + admin check
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required.');
    }
    const claims = context.auth.token;
    if (claims.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Admin role required.');
    }

    const { studentId } = data;
    const schoolId      = claims.schoolId;
    if (!studentId) {
      throw new functions.https.HttpsError('invalid-argument', 'studentId required.');
    }

    // Verify student exists
    await getStudent(schoolId, studentId);

    // Build HMAC-signed token
    const token = crypto
      .createHmac('sha256', SECRET_KEY())
      .update(`${studentId}:${schoolId}`)
      .digest('hex');

    const payload = JSON.stringify({ studentId, schoolId, token });

    // Generate QR PNG buffer
    const qrBuffer = await QRCode.toBuffer(payload, {
      width:            400,
      margin:           2,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#FFFFFF' },
    });

    // Upload to Firebase Storage
    const bucket   = admin.storage().bucket();
    const filePath = `qrcodes/${schoolId}/${studentId}.png`;
    const file     = bucket.file(filePath);

    await file.save(qrBuffer, {
      metadata: {
        contentType:  'image/png',
        cacheControl: 'public,max-age=3600',
      },
    });

    // Store the protected Storage path and token on the student doc.
    // Clients should read this path through Firebase Storage permissions.
    await studentRef(schoolId, studentId).update({ qrCodePath: filePath, qrToken: token });

    console.log(`[GenerateQR] QR generated for student ${studentId}`);
    return { success: true, qrCodePath: filePath };
  });

module.exports = { generateQR };
