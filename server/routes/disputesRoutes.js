const express = require('express');
const router = express.Router();
const disputeController = require('../controllers/disputeController');

// Routes
router.post('/create-dispute', disputeController.createDispute);
router.get('/user', disputeController.getUserDisputes);
router.get('/:id', disputeController.getDisputeById);

module.exports = router;
