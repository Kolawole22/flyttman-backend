const express = require('express');
const {
  getCustomerNotifications,
  getAdminNotifications,
  getSupplierNotifications,
} = require('../controllers/notificationController');

const { markNotificationsAsRead, userIsLoggedIn, markNotificationAsReadById } = require('../controllers/notificationRead');


const router = express.Router();

router.get('/customer', getCustomerNotifications);
router.get('/admin', getAdminNotifications);
router.get('/supplier', getSupplierNotifications);

// Route to mark notifications as read
router.patch('/read', userIsLoggedIn, markNotificationsAsRead);

// Route to mark a single notification as read by its ID
router.patch('/read/:notification_id', userIsLoggedIn, markNotificationAsReadById);

module.exports = router;
