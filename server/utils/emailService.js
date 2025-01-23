const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const sendEmail = async (to, { subject, html }) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject,
    html
  };

  await transporter.sendMail(mailOptions);
};

const templates = {
  reviewRequest: ({ bidId, serviceType, reviewLink }) => ({
    subject: `How was your ${serviceType} experience?`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2>Your Feedback Matters!</h2>
        <p>We hope your recent ${serviceType} went smoothly.</p>
        <p>Would you take a moment to share your experience? It only takes a minute!</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${reviewLink}" style="
            background-color: #4CAF50;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 4px;
            display: inline-block;
          ">
            Rate Your Experience
          </a>
        </div>
        <p>Your feedback helps us maintain high service standards and assists other customers in making informed decisions.</p>
        <p>Thank you for choosing our platform!</p>
      </div>
    `
  })
};

module.exports = { sendEmail, templates };
