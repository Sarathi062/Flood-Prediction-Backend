const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Admin = require("../models/Admin");

mongoose.connect(process.env.MONGO_URI);

const createAdmin = async () => {
  const hashedPassword = await bcrypt.hash("admin123", 10);

  await Admin.create({
    email: "admin@gmail.com",
    password: hashedPassword,
    name: "Super Admin",
  });

  console.log("Admin created successfully");
  process.exit();
};

createAdmin();