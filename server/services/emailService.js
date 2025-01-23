const { emailService } = require('../../utils/emailService');

const sendReviewReminder = async ({ email, bidId, serviceType }) => {
  try {
    const formattedServiceType = serviceType
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    const emailData = {
      to: email,
      subject: 'Please Review Your Recent Service',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">How was your ${formattedServiceType} service?</h2>
          
          <p>We hope you were satisfied with your recent service. Your feedback is important to us!</p>
          
          <p>Please take a moment to share your experience - it helps us maintain high quality standards 
             and helps other customers make informed decisions.</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/review/${bidId}" 
               style="background-color: #007bff; 
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
    console.log(`Review reminder sent successfully to ${email} for bid ${bidId}`);
    return true;
  } catch (error) {
    console.error('Error sending review reminder email:', error);
    throw error;
  }
};

module.exports = {
  sendReviewReminder
}; 