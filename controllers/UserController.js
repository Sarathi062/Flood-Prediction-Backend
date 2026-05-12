const User = require("../models/User");
const sendMailSilently = require("../helper/sendMailSilently");

/* ============================================================
   4️⃣ SEND REGION ALERT MAIL
============================================================ */

exports.sendRegionAlertMail = async (req, res) => {
  try {
    const { region, subject, message, level } = req.body;
    if (!region || !message) {
      return res.status(400).json({
        success: false,
        message: "Region and message are required",
      });
    }

    const users = await User.find({
      "subscribedRegions.0.0": region.toLowerCase(),
    });

    if (!users.length) {
      return res.json({
        success: true,
        message: "No users subscribed to this region",
      });
    }

    // Send mail to all subscribed users
    for (const user of users) {
      sendMailSilently({
        email: user.email,
        type: "region-alert",
        region,
        subject,
        message,
        level,
      });

      // Optional: push notification into DB
      user.notifications.push({
        title: `Flood Alert - ${region}`,
        message,
        level,
        seen: false,
        createdAt: new Date(),
      });

      await user.save();
    }

    res.json({
      success: true,
      message: `Alert sent to ${users.length} subscribed users`,
    });
  } catch (error) {
    console.error("Send region alert error:", error);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

/* ============================================================
   1️⃣ MARK ALL NOTIFICATIONS AS SEEN
============================================================ */
exports.markNotificationsSeen = async (req, res) => {
  try {
    const userId = req.user.id;

    // 1️⃣ Fetch full user first
    const user = await User.findById(userId);

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // 2️⃣ If notifications do NOT exist, create default one
    if (!user.notifications || user.notifications.length === 0) {
      user.notifications = [];
    }

    // 3️⃣ Mark all notifications as seen
    user.notifications = user.notifications.map((n) => ({
      ...n,
      seen: true,
    }));

    await user.save();

    return res.json({
      success: true,
      message: "Notifications marked as seen",
    });
  } catch (err) {
    console.error("Mark seen error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ============================================================
   2️⃣ SAVE ALERT PROFILE (phone / preferences)
============================================================ */
exports.updateAlertProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const { phone, smsEnabled, emailEnabled } = req.body;

    const user = await User.findByIdAndUpdate(
      userId,
      {
        alertProfile: {
          phone,
          smsEnabled,
          emailEnabled,
          completed: true,
        },
        $set: {
          "notifications.$[n].seen": true,
        },
      },
      {
        new: true,
        arrayFilters: [{ "n.id": "complete-alert-profile" }],
      },
    );
    sendMailSilently({
      email: user.email,
      phone,
      type: "alert-profile",
    });
    res.json({
      success: true,
      message: "Alert profile updated",
      user,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ============================================================
   3️⃣ SUBSCRIBE TO REGION
============================================================ */
exports.subscribeToRegion = async (req, res) => {
  try {
    const userId = req.user.id;
    let { regions } = req.body;

    // Must be an array
    if (!Array.isArray(regions)) {
      return res.status(400).json({
        success: false,
        message: "regions must be an array",
      });
    }

    // 🔥 Normalize regions (flatten + remove empty values)
    regions = regions
      .flatMap((r) => (Array.isArray(r) ? r : [r]))
      .filter(Boolean);

    // Remove duplicates
    regions = [...new Set(regions)];

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // 🔥 Assign cleaned array
    user.subscribedRegions = regions;

    await user.save();
    sendMailSilently({
      email: user.email,
      regions,
      type: "subscribe-region",
    });
    res.json({
      success: true,
      message: "Region subscriptions updated",
      subscribedRegions: user.subscribedRegions,
    });
  } catch (err) {
    console.error("Region subscription error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
