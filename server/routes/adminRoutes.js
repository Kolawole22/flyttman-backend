const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

// Authentication routes
router.post('/login', adminController.adminLogin);

// Admin management (Super admin only)
router.post('/create', adminController.createAdmin);
router.get('/list', adminController.listAdmins);

// Profile route
router.get('/profile', adminController.getProfile);
router.get('/monthly-bids-total', adminController.getMonthlyBidsTotal);


// quotation route
router.get('/quotations', adminController.getAllQuotations);
router.post('/search-quotations', adminController.searchQuotations);
router.get('/quotations/:type/:id', adminController.getQuotationById);
router.get('/quotation-bid/:type/:id', adminController.getQuotationByIdWithBid);


// bid routes
router.get('/bids', adminController.allBids);
router.post('/search-bids', adminController.searchBids);
router.get('/bids/:id', adminController.getBidById);

// order roures
router.get('/orders', adminController.orders);
router.post('/orders/search', adminController.searchOrders);
router.get('/orders/:id', adminController.getOrderById);

router.get('/quotations-bids', adminController.fetchQuotationsAndBids);


router.get('/totalcount', adminController.getTotalCounts);
router.get('/recent-activities', adminController.getRecentAdminActivities);
router.put('/bids/:id', adminController.editAcceptedBid);
router.get('/marketplace', adminController.marketPlace);
router.get('/suppliers/search', adminController.supplierSearch);
router.post('/auction/toggle', adminController.toggleAuctionMode);
router.post('/funds/disburse', adminController.fundsDisbursement);

// delete admin
router.delete('/delete/:adminId', adminController.deleteAdmins);

// logout
router.post('/logout', adminController.adminLogout);

module.exports = router; 