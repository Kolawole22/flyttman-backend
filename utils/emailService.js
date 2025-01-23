const nodemailer = require("nodemailer");

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD,
      },
      pool: true, // Use pooled connections
      maxConnections: 5,
      rateDelta: 1000,
      rateLimit: 5,
    });

    // Initialize transporter verification
    this.verifyConnection();
  }

  // Verify email connection on startup
  async verifyConnection() {
    try {
      await this.transporter.verify();
      console.log("Email service is ready");
    } catch (error) {
      console.error("Email service verification failed:", error);
    }
  }

  // Email templates
  templates = {
    // Template for customer when payment is initiated
    paymentInitiated: (data) => {
      // Ensure amount is a number
      const amount = Number(data.amount);
      if (isNaN(amount)) {
        console.error("Invalid amount provided:", data.amount);
        throw new Error("Invalid amount provided");
      }

      return {
        subject: `Payment Initiated for ${data.quotationType} - Bid #${data.bidId}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #2c3e50; text-align: center;">Payment Confirmation</h2>
            
            <div style="background-color: #f8f9fa; border-radius: 5px; padding: 20px; margin: 20px 0;">
              <p>Dear ${data.customerName},</p>
              
              <p>Your payment has been successfully initiated for your ${
                data.quotationType
              } service.</p>
              
              <div style="background-color: #ffffff; padding: 15px; border-radius: 5px; margin: 15px 0;">
                <p style="margin: 5px 0;"><strong>Bid ID:</strong> #${
                  data.bidId
                }</p>
                <p style="margin: 5px 0;"><strong>Amount:</strong> $${amount.toFixed(
                  2
                )}</p>
                <p style="margin: 5px 0;"><strong>Service:</strong> ${
                  data.quotationType
                }</p>
                <p style="margin: 5px 0;"><strong>Supplier:</strong> ${
                  data.supplierName
                }</p>
                <p style="margin: 5px 0;"><strong>Escrow Release Date:</strong> ${
                  data.escrowReleaseDate
                }</p>
              </div>

              <p><strong>What happens next?</strong></p>
              <ul style="list-style-type: none; padding-left: 0;">
                <li style="margin: 10px 0;">✓ Your payment is securely held in escrow</li>
                <li style="margin: 10px 0;">✓ The supplier will be notified to proceed with the service</li>
                <li style="margin: 10px 0;">✓ Payment will be released to the supplier after ${
                  data.escrowReleaseDate
                }</li>
              </ul>

              <p style="margin-top: 20px;">If you have any questions or concerns, please don't hesitate to contact our support team.</p>
            </div>

            <div style="text-align: center; margin-top: 20px;">
              <p style="color: #666; font-size: 14px;">Thank you for choosing our service!</p>
              <p style="color: #666; font-size: 14px;">
                ${process.env.EMAIL_SENDER_NAME}<br>
                <a href="${
                  process.env.WEBSITE_URL
                }" style="color: #007bff; text-decoration: none;">Visit Our Website</a>
              </p>
            </div>
          </div>
        `,
      };
    },

    // Template for supplier when payment is initiated
    paymentInitiatedSupplier: (data) => {
      // Ensure amount is a number
      const amount = Number(data.amount);
      if (isNaN(amount)) {
        console.error("Invalid amount provided:", data.amount);
        throw new Error("Invalid amount provided");
      }

      return {
        subject: `Bid Approved - ${data.quotationType}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #2c3e50; text-align: center;">Bid Approval Notification</h2>
            
            <div style="background-color: #f8f9fa; border-radius: 5px; padding: 20px; margin: 20px 0;">
              <p>Dear Supplier,</p>
              
              <p>Your bid has been approved!</p>
              
              <div style="background-color: #ffffff; padding: 15px; border-radius: 5px; margin: 15px 0;">
                <p style="margin: 5px 0;"><strong>Bid ID:</strong> #${
                  data.bidId
                }</p>
                <p style="margin: 5px 0;"><strong>Amount:</strong> $${amount.toFixed(
                  2
                )}</p>
                <p style="margin: 5px 0;"><strong>Service:</strong> ${
                  data.quotationType
                }</p>
                <p style="margin: 5px 0;"><strong>Release Date:</strong> ${
                  data.releaseDate
                }</p>
              </div>
              
              <p>Please log in to your account to view the complete details.</p>
            </div>
            
            <div style="text-align: center; margin-top: 20px;">
              <p style="color: #666; font-size: 14px;">Thank you for using our platform!</p>
            </div>
          </div>
        `,
      };
    },

    // Template for payment release notification
    paymentRelease: (data) => ({
      subject: `Payment Released - Bid #${data.bidId}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2c3e50; text-align: center;">Payment Release Notification</h2>
          
          <div style="background-color: #f8f9fa; border-radius: 5px; padding: 20px; margin: 20px 0;">
            <p>Hello,</p>
            
            <p>Good news! The payment for your service has been released from escrow.</p>
            
            <div style="background-color: #ffffff; padding: 15px; border-radius: 5px; margin: 15px 0;">
              <p style="margin: 5px 0;"><strong>Bid ID:</strong> #${
                data.bidId
              }</p>
              <p style="margin: 5px 0;"><strong>Amount:</strong> $${data.amount.toFixed(
                2
              )}</p>
              <p style="margin: 5px 0;"><strong>Release Date:</strong> ${
                data.releaseDate
              }</p>
            </div>

            <p>The payment should be reflected in your account within 1-3 business days.</p>
          </div>

          <div style="text-align: center; margin-top: 20px;">
            <p style="color: #666; font-size: 14px;">Thank you for using our platform!</p>
            <p style="color: #666; font-size: 14px;">
              ${process.env.EMAIL_SENDER_NAME}<br>
              <a href="${
                process.env.WEBSITE_URL
              }" style="color: #007bff; text-decoration: none;">Visit Our Website</a>
            </p>
          </div>
        </div>
      `,
    }),

    // Auction - Supplier Wins Notification
    auctionWonSupplier: (data) => ({
      subject: `Congratulations! You've won the auction - ${data.quotationType}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2c3e50; text-align: center;">Auction Won Notification</h2>
          
          <div style="background-color: #f8f9fa; border-radius: 5px; padding: 20px; margin: 20px 0;">
            <p>Dear ${data.supplierName},</p>
            
            <p>Congratulations! You have won the auction for the ${
              data.quotationType
            } (ID: ${data.quotationId}).</p>
            
            <div style="background-color: #ffffff; padding: 15px; border-radius: 5px; margin: 15px 0;">
              <p style="margin: 5px 0;"><strong>Bid ID:</strong> #${
                data.bidId
              }</p>
              <p style="margin: 5px 0;"><strong>Final Price:</strong> $${data.finalPrice.toFixed(
                2
              )}</p>
              <p style="margin: 5px 0;"><strong>Service:</strong> ${
                data.quotationType
              }</p>
              <p style="margin: 5px 0;"><strong>Escrow Release Date:</strong> ${
                data.escrowReleaseDate
              }</p>
            </div>
            
            <p>Please proceed with the service as per the agreement. Thank you for participating in the auction!</p>
          </div>
          
          <div style="text-align: center; margin-top: 20px;">
            <p style="color: #666; font-size: 14px;">Thank you for using our platform!</p>
          </div>
        </div>
      `,
    }),

    // Auction - Customer Notification
    auctionCompletedCustomer: (data) => ({
      subject: `Auction Completed - ${data.quotationType}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2c3e50; text-align: center;">Auction Completed</h2>
          
          <div style="background-color: #f8f9fa; border-radius: 5px; padding: 20px; margin: 20px 0;">
            <p>Dear Customer,</p>
            
            <p>The auction for your ${data.quotationType} (ID: ${
        data.quotationId
      }) has been successfully completed.</p>
            
            <div style="background-color: #ffffff; padding: 15px; border-radius: 5px; margin: 15px 0;">
              <p style="margin: 5px 0;"><strong>Winning Bid:</strong> $${data.bidPrice.toFixed(
                2
              )}</p>
              <p style="margin: 5px 0;"><strong>Supplier Name:</strong> ${
                data.supplierName
              }</p>
              <p style="margin: 5px 0;"><strong>Service:</strong> ${
                data.quotationType
              }</p>
              <p style="margin: 5px 0;"><strong>Escrow Release Date:</strong> ${
                data.escrowReleaseDate
              }</p>
            </div>
            
            <p>The supplier will be notified to proceed with the service. Thank you for using our platform!</p>
          </div>
          
          <div style="text-align: center; margin-top: 20px;">
            <p style="color: #666; font-size: 14px;">Thank you for trusting our services!</p>
          </div>
        </div>
      `,
    }),

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
      `,
    }),
  };

  // Send email function
  async sendEmail(to, template) {
    try {
      const result = await this.transporter.sendMail({
        from: `"${process.env.EMAIL_SENDER_NAME}" <${process.env.EMAIL_USER}>`,
        to,
        subject: template.subject,
        html: template.html,
      });

      console.log(`Email sent successfully to ${to}`);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error("Error sending email:", error);
      return { success: false, error: error.message };
    }
  }
}

// Create and export singleton instance
const emailService = new EmailService();
module.exports = emailService;
