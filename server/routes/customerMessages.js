const express = require('express');
const router = express.Router();
const {
  getCustomerConversations,
  getConversationMessages,
  replyToConversation,
  initiateConversation
} = require('../controllers/customerMessages');

/**
 * GET /api/customer/messages/conversations
 * Returns all conversations for the logged-in customer
 * Includes:
 * - Conversation ID
 * - Bid ID
 * - Quotation type
 * - Unread message count
 * - Last message preview
 * - Timestamps
 */
router.get('/conversations', getCustomerConversations);

/**
 * GET /api/customer/messages/conversations/:conversation_id/messages
 * Returns all messages in a specific conversation
 * - Verifies customer owns the conversation
 * - Returns messages in chronological order
 * - Automatically marks admin messages as read
 * - Includes sender info and timestamps
 */
router.get('/conversations/:conversation_id/messages', getConversationMessages);

/**
 * POST /api/customer/messages/conversations/:conversation_id/reply
 * Adds a new message to an existing conversation
 * - Verifies customer owns the conversation
 * - Validates message content
 * - Updates conversation timestamp
 * - Notifies admin via socket.io
 * Body: { content: string }
 */
router.post('/conversations/:conversation_id/reply', replyToConversation);

/**
 * POST /api/customer/messages/conversations
 * Creates a new conversation for an accepted bid
 * - Verifies customer owns the bid's quotation
 * - Checks bid is accepted
 * - Prevents duplicate conversations
 * - Notifies admin support via socket.io
 * Body: { bid_id: number }
 */
router.post('/conversations', initiateConversation);

module.exports = router; 