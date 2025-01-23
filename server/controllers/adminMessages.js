const { getIO } = require('../../socket');
const db = require('../../db/connect');

const checkRole = (allowedRoles) => {
    return (req, res, next) => {
      if (!req.session.admin) {
        return res.status(401).json({ error: "Unauthorized. Please login." });
      }
  
      if (!allowedRoles.includes(req.session.admin.role)) {
        return res.status(403).json({ 
          error: "Forbidden. You don't have permission to access this feature." 
        });
      }
      next();
    };
};
  

const getAdminConversations = [
  checkRole(['super_admin', 'support_admin']),
  async (req, res) => {
    try {
      const query = `
        SELECT 
          c.id as conversation_id,
          c.bid_id,
          c.created_at,
          c.updated_at,
          b.quotation_type,
          COALESCE(
            cr.email_address,
            mc.email_address,
            st.email_address,
            hl.email_address,
            ca.email_address,
            jr.email_address,
            ec.email_address,
            em.email_address,
            pm.email_address
          ) as customer_email,
          (
            SELECT COUNT(*) 
            FROM messages m 
            WHERE m.conversation_id = c.id 
            AND m.is_read = false 
            AND m.sender_type = 'customer'
          ) as unread_count,
          (
            SELECT content
            FROM messages m
            WHERE m.conversation_id = c.id
            ORDER BY m.created_at DESC
            LIMIT 1
          ) as last_message
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
        ORDER BY c.updated_at DESC
      `;

      const conversations = await new Promise((resolve, reject) => {
        db.query(query, [], (err, results) => {
          if (err) reject(err);
          resolve(results);
        });
      });

      res.json(conversations);
    } catch (error) {
      console.error('Error fetching admin conversations:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
];

const adminReplyToConversation = [
  checkRole(['super_admin', 'support_admin']),
  async (req, res) => {
    const { conversation_id, content } = req.body;
    const adminId = req.session.admin.id;

    if (!content?.trim()) {
      return res.status(400).json({ error: "Message content cannot be empty" });
    }

    try {
      // Get conversation details to verify it exists
      const [conversation] = await new Promise((resolve, reject) => {
        db.query(
          'SELECT c.*, b.quotation_type FROM conversations c JOIN bids b ON c.bid_id = b.id WHERE c.id = ?',
          [conversation_id],
          (err, results) => {
            if (err) reject(err);
            resolve(results);
          }
        );
      });

      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      // Insert admin's reply with correct sender_type
      const messageQuery = `
        INSERT INTO messages (
          conversation_id,
          content,
          sender_type,
          sender_id,
          created_at,
          is_read
        ) VALUES (?, ?, 'admin', ?, NOW(), false)
      `;

      const result = await new Promise((resolve, reject) => {
        db.query(messageQuery, [conversation_id, content, adminId], (err, results) => {
          if (err) reject(err);
          resolve(results);
        });
      });

      // Update conversation timestamp
      await new Promise((resolve, reject) => {
        db.query(
          'UPDATE conversations SET updated_at = NOW() WHERE id = ?',
          [conversation_id],
          (err, results) => {
            if (err) reject(err);
            resolve(results);
          }
        );
      });

      // Emit socket event to notify customer
      const io = getIO();
      io.to(`conversation_${conversation_id}`).emit('new_message', {
        conversation_id,
        message: {
          id: result.insertId,
          content,
          sender_type: 'admin',
          sender_id: adminId,
          created_at: new Date(),
          is_read: false
        }
      });

      res.status(201).json({
        message: "Reply sent successfully",
        message_id: result.insertId
      });
    } catch (error) {
      console.error('Error sending admin reply:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
];

module.exports = {
  getAdminConversations,
  adminReplyToConversation
}; 