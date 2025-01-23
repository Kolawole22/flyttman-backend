const db = require('../../db/connect');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const notificationService = require('../../utils/notificationService');

// Create upload directory if it doesn't exist
const UPLOAD_DIR = path.join(__dirname, '../../uploads/disputes');
(async () => {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating disputes upload directory:', error);
  }
})();

// Middleware for checking if a user is logged in
const userIsLoggedIn = async (req, res, next) => {
  if (!req.session || !req.session.user || !req.session.user.id) {
    return res.status(401).json({ error: "Unauthorized. Please log in." });
  }
  // Retrieve the user from the database for validation
  try {
    const [user] = await new Promise((resolve, reject) => {
      const query = `SELECT * FROM customers WHERE id = ?`;
      db.query(query, [req.session.user.id], (err, results) => {
        if (err) reject(err);
        resolve(results);
      });
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid session. User does not exist." });
    }

    req.user = user; // Attach the user to the request object
    next();
  } catch (error) {
    console.error('Error validating session:', error);
    return res.status(500).json({ error: "Internal server error during session validation." });
  }
};

exports.createDispute = [ userIsLoggedIn, async (req, res) => {
  try {
    const { bid_id, reason, request_details } = req.body;

    // Validate required fields
    if (!bid_id || !reason || !request_details) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Check for an existing dispute for the same bid
    const existingDispute = await new Promise((resolve, reject) => {
      const query = `SELECT id FROM disputes WHERE bid_id = ?`;
      db.query(query, [bid_id], (err, results) => {
        if (err) reject(err);
        resolve(results);
      });
    });

    if (existingDispute && existingDispute.length > 0) {
      return res.status(400).json({ error: "A dispute for this bid has already been filed." });
    }

    // Verify bid exists and belongs to the user
    const [bid] = await new Promise((resolve, reject) => {
      const query = `
        SELECT b.*, s.id AS supplier_id 
        FROM bids b
        LEFT JOIN suppliers s ON b.supplier_id = s.id
        WHERE b.id = ? AND b.status = 'accepted'
      `;
      db.query(query, [bid_id], (err, results) => {
        if (err) reject(err);
        resolve(results);
      });
    });

    if (!bid) {
      return res.status(404).json({ error: "Bid not found or not accepted" });
    }

    const against = bid.supplier_id;

    // Handle file uploads
    let images = [];
    if (req.files && req.files.images) {
      const uploadedFiles = Array.isArray(req.files.images) ? req.files.images : [req.files.images];

      for (const file of uploadedFiles) {
        const uniqueFilename = `${req.user.email}_${uuidv4()}${path.extname(file.name)}`;
        const filePath = path.join(UPLOAD_DIR, uniqueFilename);

        await file.mv(filePath);
        images.push(`/uploads/disputes/${uniqueFilename}`);
      }
    }

    // Insert dispute into the database
    const result = await new Promise((resolve, reject) => {
      const query = `
        INSERT INTO disputes 
        (bid_id, submitted_by, against, reason, request_details, images)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      db.query(
        query,
        [bid_id, req.user.id, against, reason, request_details, JSON.stringify(images)],
        (err, results) => {
          if (err) reject(err);
          resolve(results);
        }
      );
    });

    // Notify admins about the new dispute
    await notificationService.notifyAdmin({
      title: 'New Dispute Submitted',
      message: `Dispute submitted by ${req.user.email}`,
      type: 'dispute',
      referenceId: result.insertId,
      referenceType: 'disputes',
    });

    res.status(201).json({
      message: "Dispute created successfully",
      dispute_id: result.insertId,
    });
  } catch (error) {
    console.error("Error creating dispute:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
];

exports.getUserDisputes = [
  userIsLoggedIn,
  async (req, res) => {
    try {
      const disputes = await new Promise((resolve, reject) => {
        const query = `
          SELECT 
            d.id AS dispute_id,
            d.reason,
            d.request_details,
            d.status,
            d.created_at,
            b.quotation_type,
            s.company_name AS supplier_name,
            c.fullname AS submitted_by,
            d.images
          FROM disputes d
          JOIN bids b ON d.bid_id = b.id
          JOIN suppliers s ON b.supplier_id = s.id
          JOIN customers c ON d.submitted_by = c.id
          WHERE c.fullname = ? -- Filter by logged-in user's fullname
          ORDER BY d.created_at DESC
        `;
        db.query(query, [req.user.fullname], (err, results) => {
          if (err) reject(err);
          resolve(results);
        });
      });

      if (!disputes.length) {
        return res.status(404).json({ message: 'No disputes found.' });
      }

      const processedDisputes = disputes.map((dispute) => ({
        ...dispute,
        images: JSON.parse(dispute.images || '[]'),
      }));

      res.json({
        message: 'Disputes fetched successfully.',
        data: processedDisputes,
      });
    } catch (error) {
      console.error('Error fetching disputes:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
];

exports.getDisputeById = [
  userIsLoggedIn,
  async (req, res) => {
    try {
      const [dispute] = await new Promise((resolve, reject) => {
        const query = `
          SELECT 
            d.id AS dispute_id,
            d.reason,
            d.request_details,
            d.status,
            d.created_at,
            b.quotation_type,
            b.total_price AS transaction_amount,
            s.company_name AS supplier_name,
            c.fullname AS submitted_by,
            d.images
          FROM disputes d
          JOIN bids b ON d.bid_id = b.id
          JOIN suppliers s ON b.supplier_id = s.id
          JOIN customers c ON d.submitted_by = c.id
          WHERE d.id = ? AND c.fullname = ? -- Ensure fullname matches the logged-in user
        `;
        db.query(query, [req.params.id, req.user.fullname], (err, results) => {
          if (err) reject(err);
          resolve(results);
        });
      });

      if (!dispute) {
        return res.status(404).json({ error: 'Dispute not found' });
      }

      dispute.images = JSON.parse(dispute.images || '[]');
      res.json({
        message: 'Dispute details fetched successfully.',
        data: dispute,
      });
    } catch (error) {
      console.error('Error fetching dispute:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
];




