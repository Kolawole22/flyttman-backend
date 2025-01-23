const { getIO } = require('../../socket');
const db = require('../../db/connect');

const userIsLoggedIn = (req, res, next) => {
    if (req.session && req.session.user) {
      // User is logged in, proceed to the next middleware or route
      return next();
    } else {
      // User is not logged in, redirect or respond with an error
      return res.status(401).json({ error: "Unauthorized. Please log in." });
    }
};

const getCustomerConversations = [
  userIsLoggedIn,
  async (req, res) => {
    const customerEmail = req.session.user.email;

    try {
      const query = `
        SELECT 
          c.id as conversation_id,
          c.bid_id,
          c.created_at,
          c.updated_at,
          b.quotation_type,
          (
            SELECT COUNT(*) 
            FROM messages m 
            WHERE m.conversation_id = c.id 
            AND m.is_read = false 
            AND m.sender_type = 'admin'
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
        WHERE b.id IN (
          SELECT b2.id FROM bids b2
          LEFT JOIN company_relocation cr ON b2.quotation_id = cr.id AND b2.quotation_type = 'company_relocation'
          LEFT JOIN move_out_cleaning mc ON b2.quotation_id = mc.id AND b2.quotation_type = 'move_out_cleaning'
          LEFT JOIN storage st ON b2.quotation_id = st.id AND b2.quotation_type = 'storage'
          LEFT JOIN heavy_lifting hl ON b2.quotation_id = hl.id AND b2.quotation_type = 'heavy_lifting'
          LEFT JOIN carrying_assistance ca ON b2.quotation_id = ca.id AND b2.quotation_type = 'carrying_assistance'
          LEFT JOIN junk_removal jr ON b2.quotation_id = jr.id AND b2.quotation_type = 'junk_removal'
          LEFT JOIN estate_clearance ec ON b2.quotation_id = ec.id AND b2.quotation_type = 'estate_clearance'
          LEFT JOIN evacuation_move em ON b2.quotation_id = em.id AND b2.quotation_type = 'evacuation_move'
          LEFT JOIN privacy_move pm ON b2.quotation_id = pm.id AND b2.quotation_type = 'privacy_move'
          WHERE cr.email_address = ? 
          OR mc.email_address = ?
          OR st.email_address = ?
          OR hl.email_address = ?
          OR ca.email_address = ?
          OR jr.email_address = ?
          OR ec.email_address = ?
          OR em.email_address = ?
          OR pm.email_address = ?
        )
        ORDER BY c.updated_at DESC
      `;

      const conversations = await new Promise((resolve, reject) => {
        db.query(query, Array(9).fill(customerEmail), (err, results) => {
          if (err) reject(err);
          resolve(results);
        });
      });

      res.json(conversations);
    } catch (error) {
      console.error('Error fetching customer conversations:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
];

const getConversationMessages = [
  userIsLoggedIn,
  async (req, res) => {
    const { conversation_id } = req.params;
    const customerEmail = req.session.user.email;

    try {
      // Verify customer has access to this conversation
      const [conversation] = await new Promise((resolve, reject) => {
        db.query(`
          SELECT c.* FROM conversations c
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
          WHERE c.id = ? AND (
            cr.email_address = ? OR
            mc.email_address = ? OR
            st.email_address = ? OR
            hl.email_address = ? OR
            ca.email_address = ? OR
            jr.email_address = ? OR
            ec.email_address = ? OR
            em.email_address = ? OR
            pm.email_address = ?
          )
        `, [conversation_id, ...Array(9).fill(customerEmail)], (err, results) => {
          if (err) reject(err);
          resolve(results);
        });
      });

      if (!conversation) {
        return res.status(403).json({ error: "Access denied to this conversation" });
      }

      // Get messages
      const messages = await new Promise((resolve, reject) => {
        db.query(`
          SELECT 
            id,
            content,
            sender_type,
            sender_id,
            created_at,
            is_read
          FROM messages 
          WHERE conversation_id = ?
          ORDER BY created_at ASC
        `, [conversation_id], (err, results) => {
          if (err) reject(err);
          resolve(results);
        });
      });

      // Mark admin messages as read
      await new Promise((resolve, reject) => {
        db.query(`
          UPDATE messages 
          SET is_read = true 
          WHERE conversation_id = ? 
          AND sender_type = 'admin' 
          AND is_read = false
        `, [conversation_id], (err, results) => {
          if (err) reject(err);
          resolve(results);
        });
      });

      res.json(messages);
    } catch (error) {
      console.error('Error fetching conversation messages:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
];

const replyToConversation = [
  userIsLoggedIn,
  async (req, res) => {
    const { conversation_id } = req.params;
    const { content } = req.body;
    const customer_email = req.session.user.email;

    if (!content?.trim()) {
      return res.status(400).json({ error: "Message content cannot be empty." });
    }

    try {
      // Check if the conversation exists and get bid details
      const [conversationDetails] = await new Promise((resolve, reject) => {
        const checkQuery = `
          SELECT 
            c.id AS conversation_id,
            b.id AS bid_id,
            b.quotation_id,
            b.quotation_type
          FROM conversations c
          JOIN bids b ON c.bid_id = b.id
          WHERE c.id = ?
        `;
        db.query(checkQuery, [conversation_id], (err, results) => {
          if (err) return reject(err);
          resolve(results);
        });
      });

      if (!conversationDetails) {
        return res.status(404).json({ error: "Conversation not found." });
      }

      // Verify if the customer owns the quotation
      const ownershipQuery = `
        SELECT 1 
        FROM ${conversationDetails.quotation_type} 
        WHERE id = ? AND email_address = ?
      `;

      const [ownership] = await new Promise((resolve, reject) => {
        db.query(
          ownershipQuery,
          [conversationDetails.quotation_id, customer_email],
          (err, results) => {
            if (err) return reject(err);
            resolve(results);
          }
        );
      });

      if (!ownership) {
        console.log("Access denied details:", {
          conversation_id,
          customer_email,
          quotation_type: conversationDetails.quotation_type,
          quotation_id: conversationDetails.quotation_id,
        });
        return res.status(403).json({ error: "Access denied to this conversation." });
      }

      // Insert customer's reply into `messages` table
      const result = await new Promise((resolve, reject) => {
        db.query(
          `
          INSERT INTO messages (
            conversation_id,
            content,
            sender_type,
            sender_id,
            created_at,
            is_read
          ) VALUES (?, ?, 'customer', ?, NOW(), false)
          `,
          [conversation_id, content, customer_email],
          (err, results) => {
            if (err) return reject(err);
            resolve(results);
          }
        );
      });

      // Update conversation's `updated_at` timestamp
      await new Promise((resolve, reject) => {
        db.query(
          "UPDATE conversations SET updated_at = NOW() WHERE id = ?",
          [conversation_id],
          (err) => (err ? reject(err) : resolve())
        );
      });

      // Notify admin via socket
      const io = getIO();
      const message = {
        conversation_id,
        content,
        sender_type: "customer",
        sender_id: customer_email,
        created_at: new Date(),
        is_read: false,
      };

      io.to("admin_support").emit("new_message", {
        conversation_id,
        message,
      });

      // Notify customer via their specific room (optional)
      io.to(`customer_${customer_email}`).emit("message_sent", message);

      res.status(201).json({
        message: "Reply sent successfully",
        message_id: result.insertId,
      });
    } catch (error) {
      console.error("Error sending customer reply:", error);
      if (error.code === "ER_NO_SUCH_TABLE") {
        return res.status(400).json({ error: "Invalid quotation type." });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  },
];





/**
 * Initiates a new conversation for a customer regarding a specific bid
 * Checks if:
 * 1. The customer owns the quotation related to the bid
 * 2. A conversation doesn't already exist for this bid
 * 3. The bid status is 'accepted' (customer can only chat about accepted bids)
 */
const initiateConversation = [
  userIsLoggedIn, // Middleware to ensure the user is logged in
  async (req, res) => {
    const { bid_id } = req.body;
    const customerEmail = req.session.user.email; // Use email for validation

    if (!bid_id) {
      return res.status(400).json({ error: "Bid ID is required" });
    }

    try {
      // Check if the bid exists, is accepted, and belongs to the customer
      const query = `
        SELECT b.*, 
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
               END AS customer_email
        FROM bids b
        LEFT JOIN company_relocation cr ON b.quotation_id = cr.id AND b.quotation_type = 'company_relocation'
        LEFT JOIN move_out_cleaning mc ON b.quotation_id = mc.id AND b.quotation_type = 'move_out_cleaning'
        LEFT JOIN storage st ON b.quotation_id = st.id AND b.quotation_type = 'storage'
        LEFT JOIN heavy_lifting hl ON b.quotation_id = hl.id AND b.quotation_type = 'heavy_lifting'
        LEFT JOIN carrying_assistance ca ON b.quotation_id = ca.id AND b.quotation_type = 'carrying_assistance'
        LEFT JOIN junk_removal jr ON b.quotation_id = jr.id AND b.quotation_type = 'junk_removal'
        LEFT JOIN estate_clearance ec ON b.quotation_id = ec.id AND b.quotation_type = 'estate_clearance'
        LEFT JOIN evacuation_move em ON b.quotation_id = em.id AND b.quotation_type = 'evacuation_move'
        LEFT JOIN privacy_move pm ON b.quotation_id = pm.id AND b.quotation_type = 'privacy_move'
        WHERE b.id = ? AND b.status = 'accepted'
      `;

      const [bid] = await new Promise((resolve, reject) => {
        db.query(query, [bid_id], (err, results) => {
          if (err) return reject(err);
          resolve(results);
        });
      });

      // Validate bid ownership and existence
      if (!bid || bid.customer_email !== customerEmail) {
        return res.status(403).json({
          error: "Cannot create conversation. Either the bid doesn't exist, isn't accepted, or you don't have access to it.",
        });
      }

      // Check if a conversation already exists for the bid
      const [existingConversation] = await new Promise((resolve, reject) => {
        db.query(
          'SELECT id FROM conversations WHERE bid_id = ?',
          [bid_id],
          (err, results) => {
            if (err) return reject(err);
            resolve(results);
          }
        );
      });

      if (existingConversation) {
        return res.status(400).json({
          error: "Conversation already exists",
          conversation_id: existingConversation.id,
        });
      }

      // Create a new conversation
      const result = await new Promise((resolve, reject) => {
        db.query(
          'INSERT INTO conversations (bid_id, created_at, updated_at) VALUES (?, NOW(), NOW())',
          [bid_id],
          (err, results) => {
            if (err) return reject(err);
            resolve(results);
          }
        );
      });

      // Notify admin support via socket
      const io = getIO();
      io.to('admin_support').emit('new_conversation', {
        conversation_id: result.insertId,
        bid_id,
        quotation_type: bid.quotation_type,
        created_at: new Date(),
      });

      res.status(201).json({
        message: "Conversation created successfully.",
        conversation_id: result.insertId,
      });
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ error: "Internal server error." });
    }
  },
];

module.exports = {
  getCustomerConversations,
  getConversationMessages,
  replyToConversation,
  initiateConversation
}; 