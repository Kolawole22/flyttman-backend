const db = require('../../db/connect');

// Middleware to check if the user is logged in
const userIsLoggedIn = (req, res, next) => {
  if (req.session && (req.session.user || req.session.admin || req.session.supplier)) {
    return next();
  }
  return res.status(401).json({ error: "Unauthorized. Please log in." });
};

// Determine recipient type and ID dynamically
const getRecipientDetails = (req) => {
  if (req.session.admin) {
    return { recipientId: req.session.admin.username, recipientType: 'admin' };
  } else if (req.session.user) {
    return { recipientId: req.session.user.email, recipientType: 'customer' };
  } else if (req.session.supplier) {
    return { recipientId: req.session.supplier.email, recipientType: 'supplier' };
  }
  return null;
};

// Mark notifications as read
const markNotificationsAsRead = async (req, res) => {
  const { notification_ids } = req.body; // Array of notification IDs to mark as read
  const recipientDetails = getRecipientDetails(req);

  if (!recipientDetails) {
    return res.status(403).json({ error: "User type not recognized." });
  }

  if (!notification_ids || !Array.isArray(notification_ids) || notification_ids.length === 0) {
    return res.status(400).json({ error: "Notification IDs must be a non-empty array." });
  }

  try {
    const query = `
      UPDATE notifications
      SET is_read = TRUE
      WHERE id IN (?) AND recipient_id = ? AND recipient_type = ?
    `;

    const result = await new Promise((resolve, reject) => {
      db.query(
        query,
        [notification_ids, recipientDetails.recipientId, recipientDetails.recipientType],
        (err, results) => {
          if (err) reject(err);
          resolve(results);
        }
      );
    });

    res.status(200).json({
      message: `${result.affectedRows} notifications marked as read.`,
    });
  } catch (error) {
    console.error('Error marking notifications as read:', error);
    res.status(500).json({ error: "Internal server error." });
  }
};

// Mark a single notification as read by ID
const markNotificationAsReadById = async (req, res) => {
  const { notification_id } = req.params; // Single notification ID from the request params
  const recipientDetails = getRecipientDetails(req);

  if (!recipientDetails) {
    return res.status(403).json({ error: "User type not recognized." });
  }

  if (!notification_id) {
    return res.status(400).json({ error: "Notification ID is required." });
  }

  try {
    const query = `
      UPDATE notifications
      SET is_read = TRUE
      WHERE id = ? AND recipient_id = ? AND recipient_type = ?
    `;

    const result = await new Promise((resolve, reject) => {
      db.query(
        query,
        [notification_id, recipientDetails.recipientId, recipientDetails.recipientType],
        (err, results) => {
          if (err) reject(err);
          resolve(results);
        }
      );
    });

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Notification not found or already marked as read." });
    }

    res.status(200).json({
      message: "Notification marked as read successfully.",
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: "Internal server error." });
  }
};

module.exports = { 
  markNotificationsAsRead, 
  markNotificationAsReadById, 
  userIsLoggedIn 
};
