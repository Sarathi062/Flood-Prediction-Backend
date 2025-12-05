const mailer = require("../utils/mailer");

/**
 * Sends notification email silently (no throw).
 * Used for region subscription or alert-profile updates.
 */ const formatRegions = (regions) =>
  regions.map((r) => r.charAt(0).toUpperCase() + r.slice(1)).join(", ");

const sendMailSilently = async ({ email, type, phone, regions = [] }) => {
  const isAlertProfile = type === "alert-profile";

  // Generate Subject
  const subject = isAlertProfile
    ? "🔔 Your Alert Profile Has Been Updated"
    : "🌍 Your Region Subscription Has Been Updated";

  // Generate Plain Text Body
  const textBody = isAlertProfile
    ? `Your alert profile has been successfully updated.\nPhone: ${phone}\nRegions: ${regions.join(
        ", "
      )}`
    : `You have subscribed to the following regions:\n${regions.join(", ")}`;

  // Generate HTML Body
  const htmlBody = `
    <div style="font-family: Arial; line-height: 1.6; color: #333;">
      <h2 style="color:#4a90e2;">${
        isAlertProfile ? "Alert Profile Updated" : "Region Subscription Updated"
      }</h2>

      ${
        isAlertProfile
          ? `
        <p>Your alert profile has been updated with the following details:</p>
        <ul>
          <li><strong>Phone:</strong> ${phone}</li>
          <li><strong>Regions:</strong> ${formatRegions(regions)}</li>
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

    console.log("📨 [MAIL-SUCCESS]", {
      to: email,
      type,
      timestamp: new Date().toISOString(),
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
