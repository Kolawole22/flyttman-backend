const db = require("../../db/connect");
const path = require("path");
const notificationService = require('../../utils/notificationService');


const ITEMS_PER_PAGE = 20;

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

exports.getAllDisputes = [
  checkRole(["super_admin", "support_admin"]),
  async (req, res) => {
    const { 
      page = 1,
      status,
      quotationType,
      startDate,
      endDate,
      search = ''
    } = req.query;

    try {
      const offset = (page - 1) * ITEMS_PER_PAGE;
      const queryParams = [];
      
      let baseQuery = `
        SELECT 
          d.id AS dispute_id,
          CONCAT(b.quotation_type, '-', b.quotation_id, '-', b.id) AS order_id,
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
        WHERE 1=1
      `;

      //  search condition
      if (search) {
        baseQuery += ` AND (
          d.id LIKE ? OR
          CONCAT(b.quotation_type, '-', b.quotation_id, '-', b.id) LIKE ? OR
          d.reason LIKE ? OR
          d.request_details LIKE ? OR
          s.company_name LIKE ? OR
          c.fullname LIKE ?
        )`;
        const searchParam = `%${search}%`;
        queryParams.push(searchParam, searchParam, searchParam, searchParam, searchParam, searchParam);
      }

      // filters
      if (status) {
        baseQuery += ` AND d.status = ?`;
        queryParams.push(status);
      }

      if (quotationType) {
        baseQuery += ` AND b.quotation_type = ?`;
        queryParams.push(quotationType);
      }

      if (startDate) {
        baseQuery += ` AND d.created_at >= ?`;
        queryParams.push(startDate);
      }

      if (endDate) {
        baseQuery += ` AND d.created_at <= ?`;
        queryParams.push(endDate);
      }

      // Add pagination parameters
      queryParams.push(ITEMS_PER_PAGE, offset);

      const disputes = await new Promise((resolve, reject) => {
        const query = baseQuery + ` ORDER BY d.created_at DESC LIMIT ? OFFSET ?`;
        db.query(query, queryParams, (err, results) => {
          if (err) reject(err);
          resolve(results);
        });
      });

      const processedDisputes = disputes.map((dispute) => ({
        ...dispute,
        images: JSON.parse(dispute.images || "[]"),
      }));

      //  count query to include filters
      const countQuery = baseQuery.replace(
        `SELECT 
          d.id AS dispute_id,
          CONCAT(b.quotation_type, '-', b.quotation_id, '-', b.id) AS order_id,
          d.reason,
          d.request_details,
          d.status,
          d.created_at,
          b.quotation_type,
          b.total_price AS transaction_amount,
          s.company_name AS supplier_name,
          c.fullname AS submitted_by,
          d.images`,
        'SELECT COUNT(*) AS total'
      );

      const totalDisputes = await new Promise((resolve, reject) => {
        db.query(countQuery, queryParams.slice(0, -2), (err, results) => {
          if (err) reject(err);
          resolve(results[0].total);
        });
      });

      res.json({
        message: "Disputes fetched successfully.",
        totalDisputes,
        totalPages: Math.ceil(totalDisputes / ITEMS_PER_PAGE),
        currentPage: Number(page),
        data: processedDisputes,
      });
    } catch (error) {
      console.error("Error fetching disputes:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
];

exports.getDisputeDetails = [
  checkRole(["super_admin", "support_admin"]),
  async (req, res) => {
    try {
      const { id } = req.params;

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
          WHERE d.id = ?
        `;
        db.query(query, [id], (err, results) => {
          if (err) reject(err);
          resolve(results);
        });
      });

      if (!dispute) {
        return res.status(404).json({ error: "Dispute not found" });
      }

      dispute.images = JSON.parse(dispute.images || "[]");
      res.json({
        message: "Dispute details fetched successfully.",
        data: dispute,
      });
    } catch (error) {
      console.error("Error fetching dispute details:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
];

exports.updateDisputeStatus = [
  checkRole(["super_admin", "support_admin"]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      // Validate status
      if (!["pending", "resolved", "under_review"].includes(status)) {
        return res.status(400).json({
          error: "Invalid status. Allowed values: pending, resolved, under_review.",
        });
      }

      // Fetch dispute details, including supplier's and customer's email
      const [dispute] = await new Promise((resolve, reject) => {
        const query = `
          SELECT 
            d.id AS dispute_id,
            b.quotation_type,
            b.total_price AS transaction_amount,
            c.email AS customer_email,
            s.email AS supplier_email
          FROM disputes d
          JOIN bids b ON d.bid_id = b.id
          JOIN customers c ON d.submitted_by = c.id
          JOIN suppliers s ON b.supplier_id = s.id
          WHERE d.id = ?
        `;
        db.query(query, [id], (err, results) => {
          if (err) reject(err);
          resolve(results);
        });
      });

      if (!dispute) {
        return res.status(404).json({ error: "Dispute not found." });
      }

      // Update dispute status
      const result = await new Promise((resolve, reject) => {
        const query = `
          UPDATE disputes 
          SET status = ? 
          WHERE id = ?
        `;
        db.query(query, [status, id], (err, results) => {
          if (err) reject(err);
          resolve(results);
        });
      });

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "Dispute not found or not updated." });
      }

      // Notify customer and supplier
      const notifications = [];

      // Customer notification
      notifications.push(
        notificationService.createNotification({
          recipientId: dispute.customer_email,
          recipientType: "customer",
          title: "Dispute Status Updated",
          message: `The status of your dispute #${id} has been updated to '${status}'.`,
          type: "dispute",
          referenceId: id,
          referenceType: "dispute",
        })
      );

      // Supplier notification
      notifications.push(
        notificationService.createNotification({
          recipientId: dispute.supplier_email,
          recipientType: "supplier",
          title: "Dispute Status Updated",
          message: `A dispute involving your service has been updated to '${status}'.`,
          type: "dispute",
          referenceId: id,
          referenceType: "dispute",
        })
      );

      // Wait for notifications to complete
      await Promise.all(notifications);

      res.json({
        message: "Dispute status updated successfully.",
      });
    } catch (error) {
      console.error("Error updating dispute status:", error);
      res.status(500).json({ error: "Internal server error." });
    }
  },
];


