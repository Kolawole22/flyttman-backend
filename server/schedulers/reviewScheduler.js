const cron = require('node-cron');
const db = require('../../db/connect');
const { emailService } = require('../../utils/emailService');

const reviewScheduler = cron.schedule('0 */1 * * *', async () => {
  console.log('Running review request scheduler...');
  
  try {
    const moves = await new Promise((resolve, reject) => {
      const query = `
        SELECT 
          b.id AS bid_id,
          b.quotation_type,
          b.created_at as completion_date,
          CASE b.quotation_type
            WHEN 'company_relocation' THEN cr.email_address
            WHEN 'move_out_cleaning' THEN mc.email_address
            WHEN 'storage' THEN st.email_address
            WHEN 'heavy_lifting' THEN hl.email_address
            WHEN 'carrying_assistance' THEN ca.email_address
            WHEN 'junk_removal' THEN jr.email_address
            WHEN 'estate_clearance' THEN ec.email_address
            WHEN 'evacuation_move' THEN em.email_address
            WHEN 'privacy_move' THEN pm.email_address
            WHEN 'moving_service' THEN ms.email_address
          END AS customer_email,
          CASE b.quotation_type
            WHEN 'company_relocation' THEN cr.move_date
            WHEN 'move_out_cleaning' THEN mc.move_date
            WHEN 'storage' THEN st.move_date
            WHEN 'heavy_lifting' THEN hl.move_date
            WHEN 'carrying_assistance' THEN ca.move_date
            WHEN 'junk_removal' THEN jr.move_date
            WHEN 'estate_clearance' THEN ec.move_date
            WHEN 'evacuation_move' THEN em.move_date
            WHEN 'privacy_move' THEN pm.move_date
            WHEN 'moving_service' THEN ms.move_date
          END AS move_date
        FROM bids b
        LEFT JOIN reviews r ON b.id = r.bid_id
        LEFT JOIN company_relocation cr ON b.quotation_id = cr.id AND b.quotation_type = 'company_relocation'
        LEFT JOIN move_out_cleaning mc ON b.quotation_id = mc.id AND b.quotation_type = 'move_out_cleaning'
        LEFT JOIN storage st ON b.quotation_id = st.id AND b.quotation_type = 'storage'
        LEFT JOIN heavy_lifting hl ON b.quotation_id = hl.id AND b.quotation_type = 'heavy_lifting'
        LEFT JOIN carrying_assistance ca ON b.quotation_id = ca.id AND b.quotation_type = 'carrying_assistance'
        LEFT JOIN junk_removal jr ON b.quotation_id = jr.id AND b.quotation_type = 'junk_removal'
        LEFT JOIN estate_clearance ec ON b.quotation_id = ec.id AND b.quotation_type = 'estate_clearance'
        LEFT JOIN evacuation_move em ON b.quotation_id = em.id AND b.quotation_type = 'evacuation_move'
        LEFT JOIN privacy_move pm ON b.quotation_id = pm.id AND b.quotation_type = 'privacy_move'
        LEFT JOIN moving_service ms ON b.quotation_id = ms.id AND b.quotation_type = 'moving_service'
        WHERE 
          b.status = 'completed'
          AND CASE b.quotation_type
            WHEN 'company_relocation' THEN cr.move_date
            WHEN 'move_out_cleaning' THEN mc.move_date
            WHEN 'storage' THEN st.move_date
            WHEN 'heavy_lifting' THEN hl.move_date
            WHEN 'carrying_assistance' THEN ca.move_date
            WHEN 'junk_removal' THEN jr.move_date
            WHEN 'estate_clearance' THEN ec.move_date
            WHEN 'evacuation_move' THEN em.move_date
            WHEN 'privacy_move' THEN pm.move_date
            WHEN 'moving_service' THEN ms.move_date
          END <= DATE_SUB(NOW(), INTERVAL 24 HOUR)
          AND CASE b.quotation_type
            WHEN 'company_relocation' THEN cr.move_date
            WHEN 'move_out_cleaning' THEN mc.move_date
            WHEN 'storage' THEN st.move_date
            WHEN 'heavy_lifting' THEN hl.move_date
            WHEN 'carrying_assistance' THEN ca.move_date
            WHEN 'junk_removal' THEN jr.move_date
            WHEN 'estate_clearance' THEN ec.move_date
            WHEN 'evacuation_move' THEN em.move_date
            WHEN 'privacy_move' THEN pm.move_date
            WHEN 'moving_service' THEN ms.move_date
          END >= DATE_SUB(NOW(), INTERVAL 48 HOUR)
          AND r.id IS NULL
      `;

      db.query(query, (err, results) => {
        if (err) reject(err);
        resolve(results);
      });
    });

    console.log(`Found ${moves.length} completed moves without reviews`);

    for (const move of moves) {
      try {
        const emailData = {
          to: move.customer_email,
          subject: 'Please Review Your Recent Service',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #333;">How was your experience?</h2>
              
              <p>We hope your ${move.quotation_type.replace(/_/g, ' ')} went smoothly! 
                 Your feedback helps us maintain high service standards.</p>
              
              <p>Please take a moment to review your experience:</p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.FRONTEND_URL}/review/${move.bid_id}" 
                   style="background-color: #4CAF50; 
                          color: white; 
                          padding: 12px 24px; 
                          text-decoration: none; 
                          border-radius: 5px; 
                          font-weight: bold;">
                  Leave Your Review
                </a>
              </div>
              
              <p style="color: #666; font-size: 0.9em;">
                This link will expire in 7 days. If you have any issues submitting your review, 
                please contact our support team.
              </p>
            </div>
          `
        };

        await emailService.sendEmail(emailData);
        console.log(`Review reminder sent successfully to ${move.customer_email} for bid ${move.bid_id}`);
      } catch (error) {
        console.error(`Failed to send review reminder for bid ${move.bid_id}:`, error);
      }
    }

  } catch (error) {
    console.error('Error in review request scheduler:', error);
  }
}, {
  scheduled: false
});

module.exports = reviewScheduler;