const express = require('express');
const axios = require('axios');
const User = require('../../model/User');
const router = express.Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const API_KEY = process.env.TWOFACTOR_API_KEY; // Set this in your .env file

// Send OTP via SMS
exports.sendOtp = async (req, res) => {
  const { phone } = req.body;

  try {
    const response = await axios.get(
      `https://2factor.in/API/V1/${API_KEY}/SMS/${phone}/AUTOGEN`
    );

    return res.status(200).json({
      success: true,
      sessionId: response.data.Details,
    });
  } catch (err) {
    console.error("Send OTP Error:", err.message);
    return res.status(500).json({
      success: false,
      message: "Failed to send OTP",
      error: err.message,
    });
  }
};


// Verify OTP via SMS
exports.verifyOtp = async (req, res) => {
  const { sessionId, otp, phone } = req.body;

  try {
    const response = await axios.get(
      `https://2factor.in/API/V1/${API_KEY}/SMS/VERIFY/${sessionId}/${otp}`
    );

    if (response.data.Details !== "OTP Matched") {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // Match user based on owner_details.phone
    const user = await User.findOne({ "owner_details.phone": phone, role : 'mdd' });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if the user is active and verified
    // if (user.status !== "active" || !user.isVerified) {
    //   return res.status(403).json({ message: "User is not active or not verified" });
    // }

    // Create token payload
    const tokenPayload = {
      id: user._id,
      code: user.code,
      name: user.name,
      role: user.role,
      position: user.position,
      status: user.status,
      isVerified: user.isVerified,
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: "6h",
    });

    return res.status(200).json({
      message: `${user.role.charAt(0).toUpperCase() + user.role.slice(1)} logged in successfully`,
      user: {
        id: user._id,
        name: user.name,
        code: user.code,
        contact: user.owner_details.phone,
        email: user.email,
        status: user.status,
        role: user.role,
        position: user.position,
        isVerified: user.isVerified,
        version: user.version,
      },
      token,
    });
  } catch (err) {
    console.error("Verify OTP Error:", err.message);
    return res.status(500).json({ message: "Failed to verify OTP", error: err.message });
  }
};
