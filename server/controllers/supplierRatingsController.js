const db = require('../../db/connect');

const userIsLoggedIn = (req, res, next) => {
  if (req.session && req.session.user) {
    return next();
  }
  return res.status(401).json({ error: "Unauthorized. Please log in." });
};

const getSupplierRatings = [
  userIsLoggedIn,
  async (req, res) => {
    const { supplier_id } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    try {
      // Get supplier's overall stats
      const statsQuery = `
        SELECT 
          COUNT(*) as total_reviews,
          AVG(satisfaction_rating) as average_rating,
          COUNT(CASE WHEN issues_reported = 1 THEN 1 END) as total_issues,
          COUNT(CASE WHEN damage_reported = 1 THEN 1 END) as total_damages
        FROM reviews r
        JOIN bids b ON r.bid_id = b.id
        WHERE b.supplier_id = ?
      `;

      // Get detailed reviews
      const reviewsQuery = `
        SELECT 
          r.id,
          r.bid_id,
          r.quotation_type,
          r.satisfaction_rating,
          r.feedback_text,
          r.created_at,
          r.evidence_urls,
          GROUP_CONCAT(
            CONCAT(
              '{"type":"', IFNULL(ri.issue_type, ''), 
              '","description":"', IFNULL(ri.description, ''),
              '","status":"', IFNULL(ri.status, ''), '"}'
            )
          ) as issues
        FROM reviews r
        JOIN bids b ON r.bid_id = b.id
        LEFT JOIN review_issues ri ON r.id = ri.review_id
        WHERE b.supplier_id = ?
        GROUP BY r.id
        ORDER BY r.created_at DESC
        LIMIT ? OFFSET ?
      `;

      // Get total count for pagination
      const countQuery = `
        SELECT COUNT(DISTINCT r.id) as total
        FROM reviews r
        JOIN bids b ON r.bid_id = b.id
        WHERE b.supplier_id = ?
      `;

      const [stats, reviews, countResult] = await Promise.all([
        new Promise((resolve, reject) => {
          db.query(statsQuery, [supplier_id], (err, results) => {
            if (err) reject(err);
            resolve(results[0]);
          });
        }),
        new Promise((resolve, reject) => {
          db.query(reviewsQuery, [supplier_id, parseInt(limit), offset], (err, results) => {
            if (err) reject(err);
            resolve(results);
          });
        }),
        new Promise((resolve, reject) => {
          db.query(countQuery, [supplier_id], (err, results) => {
            if (err) reject(err);
            resolve(results[0]);
          });
        })
      ]);

      // Process the reviews to parse JSON strings
      const processedReviews = reviews.map(review => ({
        ...review,
        evidence_urls: JSON.parse(review.evidence_urls || '[]'),
        issues: review.issues 
          ? review.issues.split(',').map(issue => {
              try {
                return JSON.parse(issue);
              } catch (e) {
                return null;
              }
            }).filter(Boolean)
          : []
      }));

      res.status(200).json({
        stats: {
          ...stats,
          average_rating: parseFloat(stats.average_rating).toFixed(1)
        },
        reviews: processedReviews,
        pagination: {
          total: countResult.total,
          page: parseInt(page),
          limit: parseInt(limit),
          total_pages: Math.ceil(countResult.total / limit)
        }
      });

    } catch (error) {
      console.error('Error fetching supplier ratings:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
];

const getSupplierLeaderboard = [
  userIsLoggedIn,
  async (req, res) => {
    const { service_type, period = 'all' } = req.query;
    
    try {
      let dateFilter = '';
      switch(period) {
        case 'month':
          dateFilter = 'AND r.created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)';
          break;
        case 'year':
          dateFilter = 'AND r.created_at >= DATE_SUB(NOW(), INTERVAL 1 YEAR)';
          break;
        default:
          dateFilter = '';
      }

      const query = `
        SELECT 
          b.supplier_id,
          s.company_name,
          COUNT(r.id) as total_reviews,
          AVG(r.satisfaction_rating) as average_rating,
          COUNT(CASE WHEN r.issues_reported = 1 THEN 1 END) as total_issues
        FROM reviews r
        JOIN bids b ON r.bid_id = b.id
        JOIN suppliers s ON b.supplier_id = s.id
        WHERE 1=1
        ${service_type ? 'AND r.quotation_type = ?' : ''}
        ${dateFilter}
        GROUP BY b.supplier_id, s.company_name
        HAVING total_reviews >= 5
        ORDER BY average_rating DESC, total_reviews DESC
        LIMIT 10
      `;

      const params = service_type ? [service_type] : [];

      const results = await new Promise((resolve, reject) => {
        db.query(query, params, (err, results) => {
          if (err) reject(err);
          resolve(results);
        });
      });

      const leaderboard = results.map(row => ({
        ...row,
        average_rating: parseFloat(row.average_rating).toFixed(1)
      }));

      res.status(200).json(leaderboard);

    } catch (error) {
      console.error('Error fetching supplier leaderboard:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
];

module.exports = {
  getSupplierRatings,
  getSupplierLeaderboard
}; 