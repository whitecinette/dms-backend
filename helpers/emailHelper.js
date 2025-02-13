// emailHelper.js
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    service: "gmail",
    host: "smtp.gmail.com",
    port: 465,
    secure: true, // true for 465, false for other ports
    auth: {
        user: process.env.EMAIL_USER, // Your Gmail address
        pass: process.env.EMAIL_PASS, // Your Gmail password or app password
    },
});

async function sendEmail(to, subject, text, fromEmail) {
    try {
        console.log(`Sending email from: ${fromEmail}`);  // Log the sender email for debugging
        const info = await transporter.sendMail({
            from: {
                name: 'SiddhaEditUser',
                address: fromEmail || process.env.EMAIL_USER, // sender address
            },
            to: to,
            subject: subject,
            text: text,
        });
        console.log("Email sent: " + info.response);
    } catch (error) {
        console.error("Error sending email: ", error);
    }
}

module.exports = { sendEmail };
