const db = require("../../db/connect");
const notificationService = require("../../utils/notificationService");

// Middleware for customer authentication
const customerIsLoggedIn = (req, res, next) => {
  if (req.session && req.session.user) {
    return next();
  }
  return res.status(401).json({ error: "Unauthorized. Please log in." });
};

// Middleware for admin authorization
const checkAdminRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.session.admin) {
      return res.status(401).json({ error: "Unauthorized. Please login." });
    }

    if (!allowedRoles.includes(req.session.admin.role)) {
      return res.status(403).json({
        error: "Forbidden. You don't have permission to perform this action.",
      });
    }
    next();
  };
};

// Admin sends a message in a dispute chat
exports.adminSendMessage = [
  checkAdminRole(["super_admin", "support_admin"]),
  async (req, res) => {
    try {
      const { dispute_id, message } = req.body;

      // Validate the dispute
      const [dispute] = await new Promise((resolve, reject) => {
        const query = `SELECT id, submitted_by FROM disputes WHERE id = ?`;
        db.query(query, [dispute_id], (err, results) => {
          if (err) reject(err);
          resolve(results);
        });
      });

      if (!dispute) {
        return res.status(404).json({ error: "Dispute not found." });
      }

      // Insert admin message
      const result = await new Promise((resolve, reject) => {
        const query = `
          INSERT INTO dispute_chats (dispute_id, sender_type, sender_id, message)
          VALUES (?, 'admin', ?, ?)
        `;
        db.query(
          query,
          [dispute_id, req.session.admin.id, message],
          (err, results) => {
            if (err) reject(err);
            resolve(results);
          }
        );
      });

      // Notify the customer
      const [customer] = await new Promise((resolve, reject) => {
        const query = `
          SELECT c.email 
          FROM customers c 
          JOIN disputes d ON d.submitted_by = c.id 
          WHERE d.id = ?
        `;
        db.query(query, [dispute_id], (err, results) => {
          if (err) reject(err);
          resolve(results);
        });
      });

      if (customer) {
        await notificationService.createNotification({
          recipientId: customer.email,
          recipientType: "customer",
          title: "New Message from Admin",
          message: `An admin has sent a new message regarding your dispute #${dispute_id}.`,
          type: "dispute_chat",
          referenceId: dispute_id,
          referenceType: "dispute",
        });
      }

      res.status(201).json({
        message: "Message sent successfully.",
        chat_id: result.insertId,
      });
    } catch (error) {
      console.error("Error sending admin message:", error);
      res.status(500).json({ error: "Internal server error." });
    }
  },
];

// Customer sends a message in a dispute chat
exports.customerSendMessage = [
  customerIsLoggedIn,
  async (req, res) => {
    try {
      const { dispute_id, message } = req.body;

      // Validate the dispute and check if the customer filed it
      const [dispute] = await new Promise((resolve, reject) => {
        const query = `SELECT id, submitted_by FROM disputes WHERE id = ?`;
        db.query(query, [dispute_id], (err, results) => {
          if (err) return reject(err);
          resolve(results);
        });
      });

      if (!dispute) {
        return res.status(404).json({ error: "Dispute not found." });
      }

      if (dispute.submitted_by !== req.session.user.id) {
        return res.status(403).json({
          error: "You are not authorized to access this dispute chat.",
        });
      }

      // Insert customer message
      const result = await new Promise((resolve, reject) => {
        const query = `
            INSERT INTO dispute_chats (dispute_id, sender_type, sender_id, message)
            VALUES (?, 'customer', ?, ?)
          `;
        db.query(
          query,
          [dispute_id, req.session.user.id, message],
          (err, results) => {
            if (err) return reject(err);
            resolve(results);
          }
        );
      });

      // Notify admins
      const adminUsername = await new Promise((resolve, reject) => {
        const query = `
            SELECT username 
            FROM admin 
            WHERE role IN ('super_admin', 'support_admin')
          `;
        db.query(query, [], (err, results) => {
          if (err) return reject(err);
          if (!results || results.length === 0) {
            return reject(new Error("No admin usernames found."));
          }
          resolve(results.map((row) => row.username));
        });
      });

      await Promise.all(
        adminUsername.map((adminUsername) =>
          notificationService.createNotification({
            recipientId: adminUsername,
            recipientType: "admin",
            title: "New Message from Customer",
            message: `A customer has sent a new message regarding dispute #${dispute_id}.`,
            type: "dispute_chat",
            referenceId: dispute_id,
            referenceType: "dispute",
          })
        )
      );

      res.status(201).json({
        message: "Message sent successfully.",
        chat_id: result.insertId,
      });
    } catch (error) {
      console.error("Error sending customer message:", error);

      // Handle specific error cases
      if (error.message === "No admin emails found.") {
        return res.status(500).json({
          error: "No admin available to notify. Please try again later.",
        });
      }

      res.status(500).json({ error: "Internal server error." });
    }
  },
];

// Fetch chat messages for a dispute (accessible by both)
exports.getChatMessages = [
  async (req, res) => {
    try {
      const { dispute_id } = req.params;

      // Validate the dispute
      const [dispute] = await new Promise((resolve, reject) => {
        const query = `SELECT id FROM disputes WHERE id = ?`;
        db.query(query, [dispute_id], (err, results) => {
          if (err) reject(err);
          resolve(results);
        });
      });

      if (!dispute) {
        return res.status(404).json({ error: "Dispute not found." });
      }

      // Fetch chat messages
      const messages = await new Promise((resolve, reject) => {
        const query = `
          SELECT 
            d.message, 
            d.sender_type, 
            d.created_at,
            CASE d.sender_type 
              WHEN 'customer' THEN c.fullname 
              WHEN 'admin' THEN a.username 
            END AS sender_name
          FROM dispute_chats d
          LEFT JOIN customers c ON d.sender_type = 'customer' AND d.sender_id = c.id
          LEFT JOIN admin a ON d.sender_type = 'admin' AND d.sender_id = a.id
          WHERE d.dispute_id = ?
          ORDER BY d.created_at ASC
        `;
        db.query(query, [dispute_id], (err, results) => {
          if (err) reject(err);
          resolve(results);
        });
      });

      res.json({
        message: "Chat messages fetched successfully.",
        data: messages,
      });
    } catch (error) {
      console.error("Error fetching chat messages:", error);
      res.status(500).json({ error: "Internal server error." });
    }
  },
];

exports.getCustomerChatMessages = [
  customerIsLoggedIn,
  async (req, res) => {
    try {
      const { dispute_id } = req.params;

      // Validate the dispute and ensure the customer filed it
      const [dispute] = await new Promise((resolve, reject) => {
        const query = `SELECT id, submitted_by FROM disputes WHERE id = ?`;
        db.query(query, [dispute_id], (err, results) => {
          if (err) reject(err);
          resolve(results);
        });
      });

      if (!dispute) {
        return res.status(404).json({ error: "Dispute not found." });
      }

      if (dispute.submitted_by !== req.session.user.id) {
        return res.status(403).json({
          error: "You are not authorized to view this dispute chat.",
        });
      }

      // Fetch chat messages
      const messages = await new Promise((resolve, reject) => {
        const query = `
            SELECT 
              d.message, 
              d.sender_type, 
              d.created_at AS time_sent,
              CASE d.sender_type 
                WHEN 'customer' THEN c.fullname 
                WHEN 'admin' THEN a.username 
              END AS sender_name
            FROM dispute_chats d
            LEFT JOIN customers c ON d.sender_type = 'customer' AND d.sender_id = c.id
            LEFT JOIN admin a ON d.sender_type = 'admin' AND d.sender_id = a.id
            WHERE d.dispute_id = ?
            ORDER BY d.created_at ASC
          `;
        db.query(query, [dispute_id], (err, results) => {
          if (err) reject(err);
          resolve(results);
        });
      });

      res.json({
        message: "Chat messages fetched successfully.",
        data: messages,
      });
    } catch (error) {
      console.error("Error fetching customer chat messages:", error);
      res.status(500).json({ error: "Internal server error." });
    }
  },
];

exports.getAdminChatMessages = [
  checkAdminRole(["super_admin", "support_admin"]),
  async (req, res) => {
    try {
      const { dispute_id } = req.params;

      // Validate the dispute
      const [dispute] = await new Promise((resolve, reject) => {
        const query = `SELECT id FROM disputes WHERE id = ?`;
        db.query(query, [dispute_id], (err, results) => {
          if (err) reject(err);
          resolve(results);
        });
      });

      if (!dispute) {
        return res.status(404).json({ error: "Dispute not found." });
      }

      // Fetch chat messages
      const messages = await new Promise((resolve, reject) => {
        const query = `
            SELECT 
              d.message, 
              d.sender_type, 
              d.created_at AS time_sent,
              CASE d.sender_type 
                WHEN 'customer' THEN c.fullname 
                WHEN 'admin' THEN a.username 
              END AS sender_name,
              d.sender_id
            FROM dispute_chats d
            LEFT JOIN customers c ON d.sender_type = 'customer' AND d.sender_id = c.id
            LEFT JOIN admin a ON d.sender_type = 'admin' AND d.sender_id = a.id
            WHERE d.dispute_id = ?
            ORDER BY d.created_at ASC
          `;
        db.query(query, [dispute_id], (err, results) => {
          if (err) reject(err);
          resolve(results);
        });
      });

      res.json({
        message: "Chat messages fetched successfully (Admin View).",
        data: messages,
      });
    } catch (error) {
      console.error("Error fetching admin chat messages:", error);
      res.status(500).json({ error: "Internal server error." });
    }
  },
];
