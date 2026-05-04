// functions/src/smsService.js
// ─────────────────────────────────────────────────────────────
// All Twilio interactions are isolated here.
// To switch SMS provider → only change this file.
// ─────────────────────────────────────────────────────────────

const functions = require('firebase-functions');

const getTwilioClient = () => {
  const sid   = process.env.TWILIO_ACCOUNT_SID || functions.config().twilio?.account_sid;
  const token = process.env.TWILIO_AUTH_TOKEN  || functions.config().twilio?.auth_token;
  const twilio = require('twilio');
  return twilio(sid, token);
};

const FROM_NUMBER = () =>
  process.env.TWILIO_FROM_NUMBER || functions.config().twilio?.from_number;

// ── Message templates ─────────────────────────────────────────
const templates = {
  morningPresent:    (name) => `${name} has arrived at school and attendance is marked.`,
  afternoonPresent:  (name) => `${name}'s afternoon attendance has been recorded.`,
  absent:            (name) => `Reminder: ${name} has not arrived at school today.`,
  manualOverride:    (name, status) => `Admin note: ${name}'s attendance has been updated to ${status}.`,
};

// ── Send helpers ──────────────────────────────────────────────
async function sendSMS({ to, message }) {
  try {
    await getTwilioClient().messages.create({
      body: message,
      from: FROM_NUMBER(),
      to,
    });
    return { success: true };
  } catch (err) {
    console.error('[SMS] Failed:', err.message);
    return { success: false, error: err.message };
  }
}

async function sendPresentSMS({ parentPhone, studentName, slot }) {
  const message = slot === 'morning'
    ? templates.morningPresent(studentName)
    : templates.afternoonPresent(studentName);
  return sendSMS({ to: parentPhone, message });
}

async function sendAbsentSMS({ parentPhone, studentName }) {
  return sendSMS({ to: parentPhone, message: templates.absent(studentName) });
}

async function sendManualOverrideSMS({ parentPhone, studentName, status }) {
  return sendSMS({
    to: parentPhone,
    message: templates.manualOverride(studentName, status),
  });
}

module.exports = { sendPresentSMS, sendAbsentSMS, sendManualOverrideSMS };
