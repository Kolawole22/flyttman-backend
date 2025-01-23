const express = require('express');
const router = express();

const quotation = require('../controllers/quotationController')
const movingServices = require('../controllers/movingServiceController')


// post requests
router.post("/company-relocation", quotation.companyRelocation);
router.post("/move-out-cleaning", quotation.moveOutCleaning);
router.post("/storage", quotation.storage);
router.post("/heavy-lifting", quotation.heavyLifting);
router.post("/carrying-assistance", quotation.carryingAssistance);
router.post("/junk-removal", quotation.junkRemoval);
router.post("/estate-clearance", quotation.estateClearance);
router.post("/evacuation-move", quotation.evacuationMove);
router.post("/privacy-move", quotation.privacyMove);
router.post('/admin-dashboard', quotation.customer_quotation_all);
router.post('/moving-service', movingServices.movingService);

module.exports = router; 