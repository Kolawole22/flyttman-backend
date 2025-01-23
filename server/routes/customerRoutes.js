const express = require('express');
const router = express.Router(); 
const customerController = require('../controllers/customerController');


// Define routes
router.get('/notifications', customerController.getNotifications);
router.get('/complaints', customerController.getCustomerComplaints);
router.get('/dashboard', customerController.dashboard);


// getting orders by order id
router.get('/orders/:orderId', customerController.orderDetails);

// post requests
router.post('/register', customerController.register);
router.post('/login', customerController.login);
router.post('/update-user', customerController.customerUpdateInfo);
router.post('/stripe-payment', customerController.customerPayment);
// router.post('/initiate-dispute', customerController.initiateDispute);


router.post('/complaints', customerController.fileComplaint);
router.post('/logout', customerController.userLogout);



module.exports = router; 