const db = require('../../db/connect');
const { getIO } = require('../../socket');

// Role-based middleware
const checkRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.session.admin) {
      return res.status(401).json({ error: "Unauthorized. Please login." });
    }

    if (!allowedRoles.includes(req.session.admin.role)) {
      return res.status(403).json({ 
        error: "Forbidden. You don't have permission to access customer messages." 
      });
    }
    next();
  };
};

// Only support_admin and super_admin can access conversations
const getAdminConversations = [
  checkRole(['super_admin', 'support_admin']),
  async (req, res) => {
    const admin = req.session.admin;
    try {
      let additionalWhere = '';
      const params = [];

      // Support admins only see conversations with issues or low ratings
      if (admin.role === 'support_admin') {
        additionalWhere = `
          AND (
            EXISTS (
              SELECT 1 FROM reviews r 
              WHERE r.bid_id = b.id 
              AND (r.issues_reported = 1 OR r.satisfaction_rating <= 3)
            )
            OR EXISTS (
              SELECT 1 FROM customer_complaints cc 
              WHERE cc.bid_id = b.id
            )
          )
        `;
      }

      const query = `
        SELECT DISTINCT
          c.id as conversation_id,
          c.bid_id,
          c.created_at,
          b.quotation_type,
          b.quotation_id,
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
          END as customer_email,
          CASE b.quotation_type
            WHEN 'company_relocation' THEN CONCAT(cr.from_city, ' to ', cr.to_city)
            WHEN 'move_out_cleaning' THEN CONCAT(mc.from_city, ' to ', mc.to_city)
            WHEN 'storage' THEN CONCAT(st.from_city, ' to ', st.to_city)
            WHEN 'heavy_lifting' THEN CONCAT(hl.from_city, ' to ', hl.to_city)
            WHEN 'carrying_assistance' THEN CONCAT(ca.from_city, ' to ', ca.to_city)
            WHEN 'junk_removal' THEN CONCAT(jr.from_city, ' to ', jr.to_city)
            WHEN 'estate_clearance' THEN CONCAT(ec.from_city, ' to ', ec.to_city)
            WHEN 'evacuation_move' THEN CONCAT(em.from_city, ' to ', em.to_city)
            WHEN 'privacy_move' THEN CONCAT(pm.from_city, ' to ', pm.to_city)
          END as location,
          (
            SELECT COUNT(*) 
            FROM messages m2 
            WHERE m2.conversation_id = c.id 
            AND m2.is_read = 0 
            AND m2.sender_type = 'customer'
          ) as unread_count,
          (
            SELECT m3.content
            FROM messages m3
            WHERE m3.conversation_id = c.id
            ORDER BY m3.created_at DESC
            LIMIT 1
          ) as last_message,
          (
            SELECT GROUP_CONCAT(DISTINCT issue_type)
            FROM customer_complaints
            WHERE bid_id = b.id
          ) as complaint_types
        FROM conversations c
        JOIN bids b ON c.bid_id = b.id
        LEFT JOIN company_relocation cr ON b.quotation_id = cr.id AND b.quotation_type = 'company_relocation'
        LEFT JOIN move_out_cleaning mc ON b.quotation_id = mc.id AND b.quotation_type = 'move_out_cleaning'
        LEFT JOIN storage st ON b.quotation_id = st.id AND b.quotation_type = 'storage'
        LEFT JOIN heavy_lifting hl ON b.quotation_id = hl.id AND b.quotation_type = 'heavy_lifting'
        LEFT JOIN carrying_assistance ca ON b.quotation_id = ca.id AND b.quotation_type = 'carrying_assistance'
        LEFT JOIN junk_removal jr ON b.quotation_id = jr.id AND b.quotation_type = 'junk_removal'
        LEFT JOIN estate_clearance ec ON b.quotation_id = ec.id AND b.quotation_type = 'estate_clearance'
        LEFT JOIN evacuation_move em ON b.quotation_id = em.id AND b.quotation_type = 'evacuation_move'
        LEFT JOIN privacy_move pm ON b.quotation_id = pm.id AND b.quotation_type = 'privacy_move'
        WHERE 1=1 ${additionalWhere}
        ORDER BY c.updated_at DESC
      `;

      const conversations = await new Promise((resolve, reject) => {
        db.query(query, params, (err, results) => {
          if (err) reject(err);
          resolve(results);
        });
      });

      res.status(200).json({
        conversations,
        admin_role: admin.role,
        total_unread: conversations.reduce((sum, conv) => sum + conv.unread_count, 0)
      });

    } catch (error) {
      console.error('Error fetching admin conversations:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
];

const initiateConversation = [
  checkRole(['super_admin', 'support_admin']),
  (req, res) => {
    const { bid_id, initial_message } = req.body;
    const admin = req.session.admin;

    if (!bid_id || !initial_message) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['bid_id', 'initial_message']
      });
    }

    // Check if bid exists and get details
    db.query(
      `SELECT 
        b.id,
        b.quotation_type,
        CONCAT(
          CASE ? 
            WHEN 'super_admin' THEN 'Admin Support'
            WHEN 'support_admin' THEN 'Customer Support'
          END,
          ' (', a.username, ')'
        ) as admin_name,
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
        END as customer_email
      FROM bids b
      CROSS JOIN admin a
      LEFT JOIN company_relocation cr ON b.quotation_id = cr.id AND b.quotation_type = 'company_relocation'
      LEFT JOIN move_out_cleaning mc ON b.quotation_id = mc.id AND b.quotation_type = 'move_out_cleaning'
      LEFT JOIN storage st ON b.quotation_id = st.id AND b.quotation_type = 'storage'
      LEFT JOIN heavy_lifting hl ON b.quotation_id = hl.id AND b.quotation_type = 'heavy_lifting'
      LEFT JOIN carrying_assistance ca ON b.quotation_id = ca.id AND b.quotation_type = 'carrying_assistance'
      LEFT JOIN junk_removal jr ON b.quotation_id = jr.id AND b.quotation_type = 'junk_removal'
      LEFT JOIN estate_clearance ec ON b.quotation_id = ec.id AND b.quotation_type = 'estate_clearance'
      LEFT JOIN evacuation_move em ON b.quotation_id = em.id AND b.quotation_type = 'evacuation_move'
      LEFT JOIN privacy_move pm ON b.quotation_id = pm.id AND b.quotation_type = 'privacy_move'
      WHERE b.id = ? AND a.id = ?`,
      [admin.role, bid_id, admin.id],
      (err, bidResults) => {
        if (err) {
          console.error('Error checking bid:', err);
          return res.status(500).json({ error: 'Internal server error' });
        }

        if (!bidResults || bidResults.length === 0) {
          return res.status(404).json({ 
            error: 'Bid not found',
            message: 'Could not find a bid with the specified ID.'
          });
        }

        const bidDetails = bidResults[0];

        // Check if conversation already exists
        db.query(
          'SELECT id FROM conversations WHERE bid_id = ?',
          [bid_id],
          (err, convResults) => {
            if (err) {
              console.error('Error checking conversation:', err);
              return res.status(500).json({ error: 'Internal server error' });
            }

            if (convResults && convResults.length > 0) {
              return res.status(400).json({
                error: 'Conversation already exists',
                conversation_id: convResults[0].id
              });
            }

            // Create new conversation
            db.query(
              'INSERT INTO conversations (bid_id, created_at, updated_at) VALUES (?, NOW(), NOW())',
              [bid_id],
              (err, createConvResult) => {
                if (err) {
                  console.error('Error creating conversation:', err);
                  return res.status(500).json({ error: 'Internal server error' });
                }

                const conversationId = createConvResult.insertId;

                // Add initial message with role-specific sender type
                db.query(
                  `INSERT INTO messages (
                    conversation_id,
                    content,
                    sender_id,
                    sender_type,
                    sender_role,
                    created_at,
                    is_read
                  ) VALUES (?, ?, ?, 'admin', ?, NOW(), false)`,
                  [conversationId, initial_message, admin.id, admin.role],
                  (err, messageResult) => {
                    if (err) {
                      console.error('Error creating message:', err);
                      return res.status(500).json({ error: 'Internal server error' });
                    }

                    // Notify customer via Socket.IO with role-specific information
                    const io = getIO();
                    io.to(`user_${bidDetails.customer_email}`).emit('new_conversation', {
                      conversation_id: conversationId,
                      bid_id,
                      admin_name: bidDetails.admin_name,
                      admin_role: admin.role,
                      initial_message,
                      created_at: new Date()
                    });

                    res.status(201).json({
                      message: 'Conversation initiated successfully',
                      conversation_id: conversationId,
                      message_id: messageResult.insertId,
                      admin_role: admin.role
                    });
                  }
                );
              }
            );
          }
        );
      }
    );
  }
];

module.exports = {
  getAdminConversations,
  initiateConversation
}; 