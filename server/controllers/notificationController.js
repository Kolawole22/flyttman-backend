const db = require('../../db/connect');

// Middleware to check if the user is logged in
const userIsLoggedIn = (req, res, next) => {
  if (req.session && req.session.user) {
    return next();
  }
  return res.status(401).json({ error: "Unauthorized. Please log in." });
};

// Middleware to check if the admin is logged in
const adminIsLoggedIn = (req, res, next) => {
  if (req.session && req.session.admin) {
    return next();
  }
  return res.status(401).json({ error: "Unauthorized. Please log in as admin." });
};

// Middleware to check if the supplier is logged in
const supplierIsLoggedIn = (req, res, next) => {
  if (req.session && req.session.supplier) {
    return next();
  }
  return res.status(401).json({ error: "Unauthorized. Please log in as supplier." });
};

// Get notifications for a customer
const getCustomerNotifications = [
  userIsLoggedIn,
  async (req, res) => {
    const customerEmail = req.session.user.email;

    try {
      const notificationsQuery = `
        SELECT id, title, message, type, reference_id, reference_type, is_read, created_at, updated_at
        FROM notifications
        WHERE recipient_id = ? AND recipient_type = 'customer'
        ORDER BY created_at DESC
      `;

      const countQuery = `
        SELECT COUNT(*) AS unread_count
        FROM notifications
        WHERE recipient_id = ? AND recipient_type = 'customer' AND is_read = FALSE
      `;

      const notificationsPromise = new Promise((resolve, reject) => {
        db.query(notificationsQuery, [customerEmail], (err, results) => {
          if (err) reject(err);
          resolve(results);
        });
      });

      const countPromise = new Promise((resolve, reject) => {
        db.query(countQuery, [customerEmail], (err, results) => {
          if (err) reject(err);
          resolve(results[0].unread_count);
        });
      });

      const [notifications, unreadCount] = await Promise.all([notificationsPromise, countPromise]);

      res.status(200).json({
        message: "Customer notifications fetched successfully.",
        unread_count: unreadCount,
        notifications,
      });
    } catch (error) {
      console.error('Error fetching customer notifications:', error);
      res.status(500).json({ error: "Internal server error." });
    }
  },
];

// Get notifications for an admin
const getAdminNotifications = [
  adminIsLoggedIn,
  async (req, res) => {
    try {
      const { page = 1, limit = 20 } = req.query; // Default values: page 1, limit 20
      const offset = (page - 1) * limit;

      const notificationsQuery = `
        SELECT id, title, message, type, reference_id, reference_type, is_read, created_at, updated_at
        FROM notifications
        WHERE recipient_type = 'admin'
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `;

      const countQuery = `
        SELECT COUNT(*) AS unread_count
        FROM notifications
        WHERE recipient_type = 'admin' AND is_read = FALSE
      `;

      const totalNotificationsQuery = `
        SELECT COUNT(*) AS total_count
        FROM notifications
        WHERE recipient_type = 'admin'
      `;

      // Fetch notifications with pagination
      const notificationsPromise = new Promise((resolve, reject) => {
        db.query(notificationsQuery, [parseInt(limit), parseInt(offset)], (err, results) => {
          if (err) reject(err);
          resolve(results);
        });
      });

      // Fetch unread count
      const countPromise = new Promise((resolve, reject) => {
        db.query(countQuery, [], (err, results) => {
          if (err) reject(err);
          resolve(results[0].unread_count);
        });
      });

      // Fetch total notifications count
      const totalNotificationsPromise = new Promise((resolve, reject) => {
        db.query(totalNotificationsQuery, [], (err, results) => {
          if (err) reject(err);
          resolve(results[0].total_count);
        });
      });

      const [notifications, unreadCount, totalCount] = await Promise.all([
        notificationsPromise,
        countPromise,
        totalNotificationsPromise,
      ]);

      res.status(200).json({
        message: "All admin notifications fetched successfully.",
        unread_count: unreadCount,
        total_count: totalCount,
        current_page: parseInt(page),
        total_pages: Math.ceil(totalCount / limit),
        notifications,
      });
    } catch (error) {
      console.error("Error fetching admin notifications:", error);
      res.status(500).json({ error: "Internal server error." });
    }
  },
];



// Get notifications for a supplier
const getSupplierNotifications = [
  supplierIsLoggedIn,
  async (req, res) => {
    const supplierEmail = req.session.supplier.email;

    try {
      const notificationsQuery = `
        SELECT id, title, message, type, reference_id, reference_type, is_read, created_at, updated_at
        FROM notifications
        WHERE recipient_id = ? AND recipient_type = 'supplier'
        ORDER BY created_at DESC
      `;

      const countQuery = `
        SELECT COUNT(*) AS unread_count
        FROM notifications
        WHERE recipient_id = ? AND recipient_type = 'supplier' AND is_read = FALSE
      `;

      const notificationsPromise = new Promise((resolve, reject) => {
        db.query(notificationsQuery, [supplierEmail], (err, results) => {
          if (err) reject(err);
          resolve(results);
        });
      });

      const countPromise = new Promise((resolve, reject) => {
        db.query(countQuery, [supplierEmail], (err, results) => {
          if (err) reject(err);
          resolve(results[0].unread_count);
        });
      });

      const [notifications, unreadCount] = await Promise.all([notificationsPromise, countPromise]);

      res.status(200).json({
        message: "Supplier notifications fetched successfully.",
        unread_count: unreadCount,
        notifications,
      });
    } catch (error) {
      console.error('Error fetching supplier notifications:', error);
      res.status(500).json({ error: "Internal server error." });
    }
  },
];



module.exports = {
  getCustomerNotifications,
  getAdminNotifications,
  getSupplierNotifications,
};
