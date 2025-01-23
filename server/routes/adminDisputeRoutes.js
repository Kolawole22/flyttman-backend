const express = require("express");
const router = express.Router();
const adminDisputeController = require("../controllers/adminDisputeController");

// Routes
router.get("/all", adminDisputeController.getAllDisputes); // Paginated list of disputes
router.get("/:id", adminDisputeController.getDisputeDetails); // Get dispute details
router.put("/:id/status", adminDisputeController.updateDisputeStatus); // Update dispute status

module.exports = router;
