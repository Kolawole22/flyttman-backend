const db = require('../../db/connect');
const notificationService = require('../../utils/notificationService');
const path = require('path');
const fs = require('fs').promises;

// Create upload directory if it doesn't exist
const UPLOAD_DIR = path.join(__dirname, '../../uploads/review-evidence');
(async () => {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating upload directory:', error);
  }
})();

// Role-based middleware
const checkRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.session.admin) {
      return res.status(401).json({ error: "Unauthorized. Please login." });
    }

    if (!allowedRoles.includes(req.session.admin.role)) {
      return res.status(403).json({ 
        error: "Forbidden. You don't have permission to perform this action." 
      });
    }
    next();
  };
};

// userIsLoggedIn middleware
const userIsLoggedIn = (req, res, next) => {
  if (req.session && req.session.user) {
    return next();
  } else {
    return res.status(401).json({ error: "Unauthorized. Please log in." });
  }
};

const submitReview = [
  userIsLoggedIn,
  async (req, res) => {
    const { bid_id, satisfaction_rating, feedback_text, reported_issues } = req.body;

    try {
      const bidQuery = `
        SELECT 
          b.id,
          b.quotation_type,
          b.supplier_id,
          CASE b.quotation_type
            WHEN 'company_relocation' THEN cr.email_address
            WHEN 'move_out_cleaning' THEN mc.email_address
            WHEN 'storage' THEN st.email_address
            WHEN 'heavy_lifting' THEN hl.email_address
            WHEN 'carrying_assistance' THEN ca.email_address
            WHEN 'junk_removal' THEN jr.email_address
            WHEN 'estate_clearance' THEN ec.email_address
            WHEN 'evacuation_move' THEN em.email_address
            WHEN 'privacy_move' THEN pm.email_address
          END AS customer_email
        FROM bids b
        LEFT JOIN company_relocation cr ON b.quotation_id = cr.id AND b.quotation_type = 'company_relocation'
        LEFT JOIN move_out_cleaning mc ON b.quotation_id = mc.id AND b.quotation_type = 'move_out_cleaning'
        LEFT JOIN storage st ON b.quotation_id = st.id AND b.quotation_type = 'storage'
        LEFT JOIN heavy_lifting hl ON b.quotation_id = hl.id AND b.quotation_type = 'heavy_lifting'
        LEFT JOIN carrying_assistance ca ON b.quotation_id = ca.id AND b.quotation_type = 'carrying_assistance'
        LEFT JOIN junk_removal jr ON b.quotation_id = jr.id AND b.quotation_type = 'junk_removal'
        LEFT JOIN estate_clearance ec ON b.quotation_id = ec.id AND b.quotation_type = 'estate_clearance'
        LEFT JOIN evacuation_move em ON b.quotation_id = em.id AND b.quotation_type = 'evacuation_move'
        LEFT JOIN privacy_move pm ON b.quotation_id = pm.id AND b.quotation_type = 'privacy_move'
        WHERE b.id = ?
      `;

      const bidResults = await new Promise((resolve, reject) => {
        db.query(bidQuery, [bid_id], (err, results) => {
          if (err) reject(err);
          resolve(results);
        });
      });

      if (!bidResults || bidResults.length === 0) {
        return res.status(404).json({ error: 'Bid not found' });
      }

      const bid = bidResults[0];

      if (!bid || bid.customer_email !== req.session.user.email) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      // Handle file uploads
      let evidenceUrls = [];
      if (req.files && req.files.evidence) {
        const evidenceFiles = Array.isArray(req.files.evidence)
          ? req.files.evidence
          : [req.files.evidence];

        for (const file of evidenceFiles) {
          const uniqueFilename = `${req.session.user.email}_${uuidv4()}${path.extname(file.name)}`;
          const filePath = path.join(UPLOAD_DIR, uniqueFilename);

          // Move file to upload directory
          await file.mv(filePath);

          // Store the relative path
          evidenceUrls.push(path.join('uploads/review-evidence', uniqueFilename));
        }
      }

      // Create the review
      const reviewQuery = `
        INSERT INTO reviews (
          bid_id,
          quotation_type,
          customer_email,
          satisfaction_rating,
          feedback_text,
          issues_reported,
          damage_reported,
          evidence_urls
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const hasIssues = Array.isArray(reported_issues) && reported_issues.length > 0;
      const hasDamage = hasIssues && reported_issues.some(issue => issue.type === 'damage');

      const reviewResult = await new Promise((resolve, reject) => {
        db.query(
          reviewQuery,
          [
            bid_id,
            bid.quotation_type,
            bid.customer_email,
            satisfaction_rating,
            feedback_text,
            hasIssues,
            hasDamage,
            JSON.stringify(evidenceUrls)
          ],
          (err, results) => {
            if (err) reject(err);
            resolve(results);
          }
        );
      });

      // Handle issues if any
      if (hasIssues) {
        const issueQuery = `
          INSERT INTO review_issues (
            review_id,
            issue_type,
            description
          ) VALUES ?
        `;

        const issueValues = reported_issues.map(issue => [
          reviewResult.insertId,
          issue.type,
          issue.description
        ]);

        if (issueValues.length > 0) {
          await new Promise((resolve, reject) => {
            db.query(issueQuery, [issueValues], (err, results) => {
              if (err) reject(err);
              resolve(results);
            });
          });
        }
      }

      res.status(201).json({
        message: 'Review submitted successfully',
        reviewId: reviewResult.insertId
      });
    } catch (error) {
      console.error('Error submitting review:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
];

const getReview = [
  userIsLoggedIn,
  async (req, res) => {
    const { bid_id } = req.params;
    
    try {
      const query = `
        SELECT 
          r.*,
          ri.issue_type,
          ri.description as issue_description,
          ri.status as issue_status
        FROM reviews r
        LEFT JOIN review_issues ri ON r.id = ri.review_id
        WHERE r.bid_id = ?
      `;

      const results = await new Promise((resolve, reject) => {
        db.query(query, [bid_id], (err, results) => {
          if (err) reject(err);
          resolve(results);
        });
      });

      if (results.length === 0) {
        return res.status(404).json({ error: 'Review not found' });
      }

      const review = {
        ...results[0],
        evidence_urls: JSON.parse(results[0].evidence_urls || '[]'),
        issues: results
          .filter(row => row.issue_type)
          .map(row => ({
            type: row.issue_type,
            description: row.issue_description,
            status: row.issue_status
          }))
      };

      res.status(200).json(review);

    } catch (error) {
      console.error('Error fetching review:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
];

const getEvidence = [
  userIsLoggedIn,
  async (req, res) => {
    const { filename } = req.params;
    const filePath = path.join(UPLOAD_DIR, filename);

    try {
      await fs.access(filePath);
      res.sendFile(filePath);
    } catch (error) {
      res.status(404).json({ error: 'File not found' });
    }
  }
];

const getAllReviewsWithEvidence = [
  checkRole(['super_admin', 'support_admin']), // Only allow authorized admin roles
  async (req, res) => {
    try {
      const { page = 1, limit = 20 } = req.query; // Pagination
      const offset = (page - 1) * limit;

      const query = `
        SELECT 
          r.id AS review_id,
          r.bid_id,
          r.customer_email,
          r.satisfaction_rating,
          r.feedback_text,
          r.evidence_urls,
          r.created_at,
          GROUP_CONCAT(
            CONCAT(
              '{"issue_type":"', COALESCE(ri.issue_type, ''), '",',
              '"description":"', COALESCE(ri.description, ''), '",',
              '"status":"', COALESCE(ri.status, ''), '"}'
            )
          ) AS issues
        FROM reviews r
        LEFT JOIN review_issues ri ON r.id = ri.review_id
        GROUP BY r.id
        ORDER BY r.created_at DESC
        LIMIT ? OFFSET ?
      `;

      const reviews = await new Promise((resolve, reject) => {
        db.query(query, [parseInt(limit), parseInt(offset)], (err, results) => {
          if (err) reject(err);
          resolve(results);
        });
      });

      // Parse evidence_urls and issues
      const parsedReviews = reviews.map(review => ({
        ...review,
        evidence_urls: JSON.parse(review.evidence_urls || '[]'), // Convert evidence_urls from string to array
        issues: review.issues
          ? JSON.parse(`[${review.issues}]`) // Convert concatenated string to array of JSON objects
          : [],
      }));

      res.status(200).json({
        message: "Reviews fetched successfully",
        reviews: parsedReviews,
        pagination: { page, limit },
      });
    } catch (error) {
      console.error("Error fetching reviews with evidence:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
];

module.exports = {
  submitReview,
  getReview,
  getEvidence,
  getAllReviewsWithEvidence
}; 
