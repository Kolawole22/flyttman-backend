const express = require('express');
const router = express.Router();
const {
  getReviewsDashboard,
  getAllReviews,
  updateIssueStatus,
  getIssuesSummary
} = require('../controllers/adminReviewController');

// Get admin dashboard statistics
router.get('/review-dashboard', getReviewsDashboard);

// Get all reviews with filtering and pagination
router.get('/reviews', getAllReviews);

// Update issue status
router.patch('/issues/:issue_id', updateIssueStatus);

// Get issues summary
router.get('/issues/summary', getIssuesSummary);

module.exports = router; 