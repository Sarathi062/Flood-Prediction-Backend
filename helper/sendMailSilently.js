const mailer = require("../utils/mailer");

const sendMailSilently = async (data) => {
  try {
    await mailer.sendMail({
      from: "Flood Prediction AI <sarathi062023@gmail.com>",
      to: data.email,
      subject:
        data.type === "alert-profile"
          ? "Your Alert Profile Has Been Updated"
          : "Your Region Subscription Has Been Updated",
      text:
        data.type === "alert-profile"
          ? `Your alert profile has been updated.\nPhone: ${data.phone}\nRegions: Pune`
          : `Your subscribed regions: ${data.regions.join(", ")}`,
    });

    // console.log("📧 Email sent silently →", data.email);
  } catch (err) {
    console.error("❌ Silent email failed:", err.message);
  }
};

module.exports = sendMailSilently;
