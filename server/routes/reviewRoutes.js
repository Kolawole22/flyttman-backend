const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');


router.post('/submit', reviewController.submitReview);
router.get('/:bid_id', reviewController.getReview);
router.get('/evidence/:filename', reviewController.getEvidence);
router.get('/admin/evidence', reviewController.getAllReviewsWithEvidence);
router.get('/admin/evidence/:filename', reviewController.getAllReviewsWithEvidence);

module.exports = router; 