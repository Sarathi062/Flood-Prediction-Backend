const mailer = require("../utils/mailer");

/**
 * Capitalize each region name
 */
const formatRegions = (regions = []) =>
  regions.map((r) => r.charAt(0).toUpperCase() + r.slice(1)).join(", ");

/**
 * Sends notification email silently (no throw).
 */
const sendMailSilently = async ({ email, type, phone, regions = [] }) => {
  const isAlertProfile = type === "alert-profile";

  // Subject
  const subject = isAlertProfile
    ? "🔔 Your Alert Profile Has Been Updated"
    : "🌍 Your Region Subscription Has Been Updated";

  // Plain text body (FIXED: now shows formatted regions)
  const textBody = isAlertProfile
    ? `Your alert profile has been successfully updated.
Phone: ${phone}
Regions: ${formatRegions(regions)}`
    : `You have subscribed to the following regions:
${formatRegions(regions)}`;

  // HTML Body
  const htmlBody = `
    <div style="font-family: Arial; line-height: 1.6; color: #333;">
      <h2 style="color:#4a90e2;">
        ${
          isAlertProfile
            ? "Alert Profile Updated"
            : "Region Subscription Updated"
        }
      </h2>

      ${
        isAlertProfile
          ? `
        <p>Your alert profile has been updated with the following details:</p>
        <ul>
          <li><strong>Phone:</strong> ${phone}</li>
        </ul>
      `
          : `
        <p>You are now subscribed to alerts for the following regions:</p>
        <p><strong>${formatRegions(regions)}</strong></p>
      `
      }

      <p>Thank you for using <strong>Flood Prediction AI</strong>.</p>
      <hr />
      <p style="font-size:12px;color:#777;">This is an automated message. Please do not reply.</p>
    </div>
  `;

  try {
    await mailer.sendMail({
      from: `Flood Prediction AI <${process.env.GMAIL_USER}>`,
      to: email,
      subject,
      text: textBody,
      html: htmlBody,
    });
  } catch (err) {
    console.error("❌ [MAIL-ERROR]: Failed to send email", {
      to: email,
      type,
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
};

module.exports = sendMailSilently;
