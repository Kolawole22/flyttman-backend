const express = require("express");
const router = express.Router();
const disputeChatController = require("../controllers/disputeChatController");

// Admin routes
router.post("/admin/send", disputeChatController.adminSendMessage);
router.get("/admin/:dispute_id/messages", disputeChatController.getAdminChatMessages);

// Customer routes
router.post("/customer/send", disputeChatController.customerSendMessage);
router.get("/customer/:dispute_id/messages", disputeChatController.getCustomerChatMessages);

module.exports = router;
