const db = require("../../db/connect");
const { emailService } = require("../../utils/emailService");

const adminIsLoggedIn = (req, res, next) => {
  if (req.session && req.session.admin) {
    // admin is logged in, proceed to the next middleware or route
    return next();
  } else {
    // admin is not logged in, redirect or respond with an error
    return res
      .status(401)
      .json({ error: "Unauthorized. Only admins can use this." });
  }
};

const getCalendarMoves = [
  adminIsLoggedIn,
  async (req, res) => {
    const { start_date, end_date, service_type, supplier_id, status } = req.query;

    try {
      // Regular services only
      const quotationTypes = [
        "carrying_assistance",
        "company_relocation",
        "estate_clearance",
        "evacuation_move",
        "heavy_lifting",
        "junk_removal",
        "move_out_cleaning",
        "privacy_move",
        "storage"
      ];

      // Regular services queries
      const regularQueries = quotationTypes
        .map(
          (type) => `
        SELECT 
          '${type}' as service_type,
          q.id as quotation_id,
          q.move_date,
          q.email_address as customer_email,
          q.email_address as customer_name,
          CONCAT(q.from_city, ' to ', q.to_city) as location,
          b.id as bid_id,
          b.supplier_id,
          s.company_name as supplier_name,
          b.status,
          b.created_at as booking_date
        FROM ${type} q
        JOIN bids b ON q.id = b.quotation_id AND b.quotation_type = '${type}'
        LEFT JOIN suppliers s ON b.supplier_id = s.id
        WHERE 1=1
        ${start_date ? `AND q.move_date >= ?` : ""}
        ${end_date ? `AND q.move_date <= ?` : ""}
        ${supplier_id ? `AND b.supplier_id = ?` : ""}
        ${status ? `AND b.status = ?` : ""}
      `
        )
        .join(" UNION ALL ");

      // Moving service queries
      const movingServiceQueries = [
        { type: 'local_move', condition: '"local_move"' },
        { type: 'long_distance_move', condition: '"long_distance_move"' },
        { type: 'moving_abroad', condition: '"moving_abroad"' }
      ].map(({ type, condition }) => `
        SELECT 
          '${type}' as service_type,
          q.id as quotation_id,
          q.move_date,
          q.email_address as customer_email,
          q.email_address as customer_name,
          CONCAT(q.from_city, ' to ', q.to_city) as location,
          b.id as bid_id,
          b.supplier_id,
          s.company_name as supplier_name,
          b.status,
          b.created_at as booking_date
        FROM moving_service q
        JOIN bids b ON q.id = b.quotation_id AND b.quotation_type = 'moving_service'
        LEFT JOIN suppliers s ON b.supplier_id = s.id
        WHERE JSON_CONTAINS(q.type_of_service, '${condition}', '$')
        ${start_date ? `AND q.move_date >= ?` : ""}
        ${end_date ? `AND q.move_date <= ?` : ""}
        ${supplier_id ? `AND b.supplier_id = ?` : ""}
        ${status ? `AND b.status = ?` : ""}
      `).join(" UNION ALL ");

      const query = `
        SELECT * FROM (${regularQueries} UNION ALL ${movingServiceQueries}) AS combined_moves 
        ORDER BY move_date ASC
      `;

      // Build params array
      let params = [];
      const totalQueries = quotationTypes.length + 3; // regular + 3 moving service types
      for (let i = 0; i < totalQueries; i++) {
        if (start_date) params.push(start_date);
        if (end_date) params.push(end_date);
        if (supplier_id) params.push(supplier_id);
        if (status) params.push(status);
      }

      const moves = await new Promise((resolve, reject) => {
        db.query(query, params, (err, results) => {
          if (err) reject(err);
          resolve(results);
        });
      });

      const calendarEvents = moves.map((move) => ({
        id: `${move.service_type}-${move.quotation_id}`,
        title: `${move.service_type
          .split("_")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ")}`,
        start: move.move_date,
        end: move.move_date,
        extendedProps: {
          customerName: move.customer_name,
          customerEmail: move.customer_email,
          location: move.location,
          supplierName: move.supplier_name,
          serviceType: move.service_type,
          status: move.status,
          bidId: move.bid_id,
        },
      }));

      res.status(200).json(calendarEvents);
    } catch (error) {
      console.error("Error fetching calendar moves:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
];

const sendMoveReminders = [
  adminIsLoggedIn,
  async (req, res) => {
    try {
      // Get moves happening tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowDate = tomorrow.toISOString().split('T')[0];

      const query = getUpcomingMovesQuery(tomorrowDate);

      const moves = await new Promise((resolve, reject) => {
        db.query(query, [], (err, results) => { // No params needed now
          if (err) reject(err);
          resolve(results);
        });
      });

      console.log(`Found ${moves.length} moves for tomorrow`);

      // Send reminders for each move
      const reminderPromises = moves.map(async move => {
        try {
          // Remind supplier
          await emailService.sendEmail({
            to: move.supplier_email,
            subject: 'Reminder: Move Scheduled for Tomorrow',
            html: `
              <h2>Move Reminder</h2>
              <p>You have a ${move.service_type.replace(/_/g, ' ')} scheduled for tomorrow.</p>
              <p><strong>Details:</strong></p>
              <ul>
                <li>Customer: ${move.customer_email}</li>
                <li>Location: ${move.location}</li>
                <li>Date: ${new Date(move.move_date).toLocaleDateString()}</li>
              </ul>
            `
          });

          // Remind customer
          await emailService.sendEmail({
            to: move.customer_email,
            subject: 'Your Move is Scheduled for Tomorrow',
            html: `
              <h2>Move Reminder</h2>
              <p>Your ${move.service_type.replace(/_/g, ' ')} is scheduled for tomorrow.</p>
              <p><strong>Details:</strong></p>
              <ul>
                <li>Service Provider: ${move.supplier_name}</li>
                <li>Location: ${move.location}</li>
                <li>Date: ${new Date(move.move_date).toLocaleDateString()}</li>
              </ul>
            `
          });

          return {
            success: true,
            move_id: move.bid_id,
            message: 'Reminders sent successfully'
          };
        } catch (error) {
          console.error(`Failed to send reminder for move ${move.bid_id}:`, error);
          return {
            success: false,
            move_id: move.bid_id,
            error: error.message
          };
        }
      });

      const results = await Promise.all(reminderPromises);
      res.status(200).json({
        message: 'Reminders processed',
        results
      });

    } catch (error) {
      console.error('Error sending move reminders:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
];

// Helper function to generate upcoming moves query
function getUpcomingMovesQuery(date) {
  const quotationTypes = [
    'company_relocation',
    'move_out_cleaning',
    'storage',
    'heavy_lifting',
    'carrying_assistance',
    'junk_removal',
    'estate_clearance',
    'evacuation_move',
    'privacy_move'
  ];

  const unionQueries = quotationTypes.map(type => `
    SELECT 
      '${type}' as service_type,
      q.id as quotation_id,
      q.move_date,
      q.email_address as customer_email,
      q.email_address as customer_name,
      CONCAT(q.from_city, ' to ', q.to_city) as location,
      b.id as bid_id,
      b.supplier_id,
      s.company_name as supplier_name,
      s.email as supplier_email,
      b.status
    FROM ${type} q
    JOIN bids b ON q.id = b.quotation_id AND b.quotation_type = '${type}'
    JOIN suppliers s ON b.supplier_id = s.id
    WHERE DATE(q.move_date) = '${date}'
    AND b.status = 'accepted'
  `).join(' UNION ALL ');

  return `${unionQueries} ORDER BY move_date ASC`;
}

module.exports = {
  getCalendarMoves,
  sendMoveReminders,
};
