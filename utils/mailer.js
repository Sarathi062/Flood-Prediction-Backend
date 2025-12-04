const nodemailer = require("nodemailer");
console.log(process.env.GMAIL_APP_PASSWORD);
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "sarathi062023@gmail.com",
    pass: process.env.GMAIL_APP_PASSWORD, // << App password here
  },
});

module.exports = transporter;
