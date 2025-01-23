const express = require('express');
const router = express.Router();
const { getSupplierRatings, getSupplierLeaderboard } = require('../controllers/supplierRatingsController');

// Get ratings for a specific supplier
router.get('/supplier/:supplier_id', getSupplierRatings);

// Get supplier leaderboard
router.get('/leaderboard', getSupplierLeaderboard);

module.exports = router; 