const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: "sarathi062023@gmail.com",
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

module.exports = transporter;
