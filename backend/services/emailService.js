const nodemailer = require('nodemailer');
const config = require('../config');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (!config.smtpUser || !config.smtpPass) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465,
    auth: {
      user: config.smtpUser,
      pass: config.smtpPass,
    },
  });

  return transporter;
}

/**
 * Send an emergency alert email to a contact.
 * @param {object} options
 * @param {string} options.toEmail - Recipient email address
 * @param {string} options.contactName - Emergency contact's name
 * @param {string} options.userName - Patient's name
 * @param {string} options.condition - Diagnosed condition
 * @param {string} options.reasoning - Diagnosis reasoning
 * @param {string} options.nextSteps - Recommended next steps
 * @param {string} [options.synopsis] - Short diagnosis synopsis
 * @param {number} options.severity - Severity level (1-3)
 * @returns {Promise<boolean>} true if sent, false if email not configured
 */
async function sendEmergencyAlert(options) {
  const mailer = getTransporter();
  if (!mailer) {
    console.warn('Email not configured (SMTP_USER/SMTP_PASS missing). Skipping emergency alert.');
    return false;
  }

  const { toEmail, contactName, userName, condition, reasoning, nextSteps, synopsis, severity } = options;

  if (!toEmail || !toEmail.includes('@')) {
    console.warn('Invalid emergency contact email:', toEmail);
    return false;
  }

  const severityLabel = severity >= 3 ? 'SEVERE' : severity >= 2 ? 'Moderate' : 'Mild';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #dc2626; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 20px;">TriageSense Emergency Alert</h1>
      </div>
      <div style="border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
        <p style="font-size: 16px; color: #111;">
          Hi <strong>${contactName}</strong>,
        </p>
        <p style="font-size: 16px; color: #111;">
          <strong>${userName}</strong> used TriageSense and received a <strong style="color: #dc2626;">${severityLabel}</strong> severity assessment. Here is a summary:
        </p>
        <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 16px; margin: 16px 0; border-radius: 4px;">
          <p style="margin: 0 0 8px 0; font-weight: 700; color: #991b1b;">Condition: ${condition}</p>
          <p style="margin: 0; color: #333;">${reasoning}</p>
        </div>
        ${synopsis ? `
        <div style="background: #fff7ed; border-left: 4px solid #f97316; padding: 16px; margin: 16px 0; border-radius: 4px;">
          <p style="margin: 0 0 8px 0; font-weight: 700; color: #9a3412;">Diagnosis synopsis:</p>
          <p style="margin: 0; color: #333; white-space: pre-line;">${synopsis}</p>
        </div>
        ` : ''}
        ${nextSteps ? `
        <div style="background: #f0fdf4; border-left: 4px solid #16a34a; padding: 16px; margin: 16px 0; border-radius: 4px;">
          <p style="margin: 0 0 8px 0; font-weight: 700; color: #166534;">Recommended next steps:</p>
          <p style="margin: 0; color: #333;">${nextSteps}</p>
        </div>
        ` : ''}
        <p style="font-size: 16px; color: #111;">
          Please check on <strong>${userName}</strong> as soon as possible.
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="font-size: 12px; color: #6b7280;">
          This is an automated alert from TriageSense. This is not medical advice. If this is a life-threatening emergency, call 911 immediately.
        </p>
      </div>
    </div>
  `;

  const text = `TriageSense Emergency Alert

Hi ${contactName},

${userName} used TriageSense and received a ${severityLabel} severity assessment.

Condition: ${condition}
${reasoning}

${synopsis ? `Diagnosis synopsis:\n${synopsis}\n` : ''}
${nextSteps ? `Recommended next steps:\n${nextSteps}\n` : ''}
Please check on ${userName} as soon as possible.

This is an automated alert from TriageSense. This is not medical advice. If this is a life-threatening emergency, call 911 immediately.`;

  await mailer.sendMail({
    from: `"TriageSense Alert" <${config.smtpFrom}>`,
    to: toEmail,
    subject: `Emergency Alert: ${userName} needs attention - ${condition}`,
    text,
    html,
  });

  console.log(`Emergency alert email sent to ${toEmail} for user ${userName}`);
  return true;
}

module.exports = { sendEmergencyAlert };
