const cron = require("node-cron");
const db = require("../../db/connect");
const emailService = require("../../utils/emailService");
const notificationService = require("../../utils/notificationService");

const schedulePaymentReleases = () => {
  cron.schedule("0 * * * *", async () => { // Runs every hour
    console.log("Running payment release scheduler every hour...");

    try {
      const query = `
        SELECT 
          b.id AS bid_id,
          b.bid_price, -- Fetch the bid price for the supplier
          b.total_price, -- Fetch the final total price for admin notifications
          b.escrow_release_date,
          s.email AS supplier_email,
          s.company_name AS supplier_name
        FROM bids b
        JOIN suppliers s ON b.supplier_id = s.id
        WHERE 
          b.payment_status = 'in_escrow'
          AND b.escrow_release_date <= NOW()
      `;

      const payments = await new Promise((resolve, reject) => {
        db.query(query, [], (err, results) => {
          if (err) {
            console.error("Database query error:", err);
            reject(err);
          }
          resolve(results);
        });
      });

      for (const payment of payments) {
        try {
          // Notify the supplier via email (bid price only)
          await emailService.sendEmail(
            payment.supplier_email,
            {
              subject: `Payment Notification for Bid #${payment.bid_id}`,
              html: `
                <p>Dear ${payment.supplier_name},</p>
                <p>The escrow period for your bid #${payment.bid_id} has ended.</p>
                <p><strong>Bid Price:</strong> $${payment.bid_price.toFixed(2)}</p>
                <p>You will receive your payment soon. Please contact support if you have any questions.</p>
                <p>Best regards,<br>Your Platform</p>
              `,
            }
          );

          // Notify the admin via email (final price included)
          await emailService.sendEmail(
            process.env.ADMIN_EMAIL, // Admin's email address
            {
              subject: `Manual Payment Required for Bid #${payment.bid_id}`,
              html: `
                <p>Dear Admin,</p>
                <p>The escrow period for Bid #${payment.bid_id} has ended.</p>
                <p><strong>Supplier:</strong> ${payment.supplier_name}</p>
                <p><strong>Final Price:</strong> $${payment.total_price.toFixed(2)}</p>
                <p>Please proceed to manually disburse the payment to the supplier.</p>
                <p>Best regards,<br>Your Platform</p>
              `,
            }
          );

          console.log(
            `Notification emails sent to admin and supplier for bid ${payment.bid_id}.`
          );

          // Add in-app notifications
          // Supplier notification (bid price only)
          await notificationService.createNotification({
            recipientId: payment.supplier_email,
            recipientType: "supplier",
            title: "Escrow Period Ended",
            message: `The escrow period for your payment of $${payment.bid_price.toFixed(
              2
            )} for Bid #${payment.bid_id} has ended. You will receive your payment soon.`,
            type: "payment",
            referenceId: payment.bid_id,
            referenceType: "bid",
          });

          // Admin notification (final price included)
          await notificationService.createNotification({
            recipientId: "admin", // Assuming "admin" is a unique identifier for the admin
            recipientType: "admin",
            title: "Manual Payment Required",
            message: `The escrow period for Bid #${payment.bid_id} has ended. Please proceed to disburse $${payment.total_price.toFixed(
              2
            )} to the supplier (${payment.supplier_name}).`,
            type: "payment",
            referenceId: payment.bid_id,
            referenceType: "bid",
          });

          console.log(
            `In-app notifications sent to admin and supplier for bid ${payment.bid_id}.`
          );

          // Update the payment status to "completed"
          await new Promise((resolve, reject) => {
            db.query(
              `
              UPDATE bids 
              SET payment_status = 'completed' 
              WHERE id = ?
              `,
              [payment.bid_id],
              (err) => (err ? reject(err) : resolve())
            );
          });

          console.log(`Payment status updated to 'completed' for bid ${payment.bid_id}.`);
        } catch (error) {
          console.error(
            `Error processing bid ${payment.bid_id}:`,
            error
          );
        }
      }
    } catch (error) {
      console.error("Error in payment release scheduler:", error);
    }
  });
};

// Export the scheduler
module.exports = { schedulePaymentReleases };
