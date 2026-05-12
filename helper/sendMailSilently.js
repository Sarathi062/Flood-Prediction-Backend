const mailer = require("../utils/mailer");

/**
 * Capitalize region names
 */
const formatRegions = (regions = []) =>
  regions.map((r) => r.charAt(0).toUpperCase() + r.slice(1)).join(", ");

/**
 * Send mail silently (never throw)
 */
const sendMailSilently = async ({
  email,
  type,
  phone,
  regions = [],
  region,
  subject,
  message,
  level,
}) => {
  let mailSubject = "";
  let textBody = "";
  let htmlBody = "";

  /* =========================================================
     ALERT PROFILE MAIL
  ========================================================= */

  if (type === "alert-profile") {
    mailSubject = "🔔 Your Alert Profile Has Been Updated";

    textBody = `Your alert profile has been successfully updated.
Phone: ${phone}
Regions: ${formatRegions(regions)}`;

    htmlBody = `
      <div style="font-family: Arial; line-height: 1.6;">
        <h2 style="color:#4a90e2;">Alert Profile Updated</h2>

        <p>Your alert profile has been updated:</p>

        <ul>
          <li><strong>Phone:</strong> ${phone}</li>
        </ul>

        <p><strong>Regions:</strong> ${formatRegions(regions)}</p>

        <hr/>
        <p style="font-size:12px;color:#777">
          Flood Prediction AI
        </p>
      </div>
    `;
  }

  /* =========================================================
     REGION SUBSCRIPTION MAIL
  ========================================================= */

  if (type === "subscribe-region") {
    mailSubject = "🌍 Region Subscription Updated";

    textBody = `You have subscribed to the following regions:
${formatRegions(regions)}`;

    htmlBody = `
      <div style="font-family: Arial;">
        <h2 style="color:#4a90e2;">Region Subscription Updated</h2>

        <p>You are now subscribed to:</p>

        <p><strong>${formatRegions(regions)}</strong></p>

        <p>Thank you for using Flood Prediction AI.</p>
      </div>
    `;
  }

  /* =========================================================
     FLOOD ALERT MAIL (NEW)
  ========================================================= */

  if (type === "region-alert") {
    const levelColor =
      level === "RED" ? "#e53935" : level === "ORANGE" ? "#fb8c00" : "#43a047";

    mailSubject = subject || `🚨 Flood Alert for ${region}`;

    textBody = `
Flood Alert

Region: ${region}
Level: ${level}

${message}

Stay safe.
Flood Prediction AI
`;

    htmlBody = `
      <div style="font-family: Arial; line-height:1.6">

        <h2 style="color:${levelColor}">
          🚨 Flood Alert - ${region}
        </h2>

        <p>
          <strong>Alert Level:</strong>
          <span style="color:${levelColor}; font-weight:bold">
            ${level}
          </span>
        </p>

        <p>${message}</p>

        <hr/>

        <p>
          Please follow official safety instructions.
        </p>

        <p style="font-size:12px;color:#777">
          Flood Prediction AI Monitoring System
        </p>

      </div>
    `;
  }

  /* =========================================================
     SEND MAIL
  ========================================================= */

  try {
    await mailer.sendMail({
      from: `Flood Prediction AI <${process.env.GMAIL_USER}>`,
      to: email,
      subject: mailSubject,
      text: textBody,
      html: htmlBody,
    });
  } catch (err) {
    console.error("❌ MAIL ERROR:", {
      email,
      type,
      error: err.message,
      time: new Date().toISOString(),
    });
  }
};

module.exports = sendMailSilently;
