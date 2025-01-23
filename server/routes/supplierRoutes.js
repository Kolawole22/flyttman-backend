const express = require('express');
const router = express.Router(); 
const supplierController = require('../controllers/supplierController');


// get requests
router.get("/view-quotation-with-bid/:bid_id", supplierController.viewQuotationWithBid);
router.get('/marketplace', supplierController.marketPlace)
router.get('/earnings', supplierController.getSupplierEarnings)


// post Requests
router.post('/register', supplierController.registerSupplier);
router.post('/login', supplierController.supplierLogin);
router.post('/customer-quotations', supplierController.customerQuotations);
router.post('/send-bid', supplierController.sendBid)

router.post('/logout', supplierController.supplierLogout);




module.exports = router; 