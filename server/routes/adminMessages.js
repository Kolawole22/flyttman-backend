const express = require('express');
const router = express.Router();
const { 
  getAdminConversations, 
  adminReplyToConversation 
} = require('../controllers/adminMessages');

router.get('/conversations', getAdminConversations);
router.post('/conversations/:conversation_id/reply', adminReplyToConversation);

module.exports = router; 