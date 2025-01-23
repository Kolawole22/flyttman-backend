const db = require("../../db/connect");
const bcrypt = require("bcryptjs");
const notificationService = require('../../utils/notificationService');
const emailService = require('../../utils/emailService');
const { format, differenceInCalendarMonths, addMonths } = require('date-fns');


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

// Admin login
exports.adminLogin = (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Both username and password are required." });
  }

  const query = `
    SELECT id, username, password, role 
    FROM admin 
    WHERE username = ?
  `;
  
  db.query(query, [username], (err, results) => {
    if (err) {
      console.error("Error querying the database:", err);
      return res.status(500).json({ error: "Internal Server Error" });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: "Invalid username or password." });
    }

    const admin = results[0];
    bcrypt.compare(password, admin.password, (bcryptErr, isMatch) => {
      if (bcryptErr) {
        console.error("Error comparing passwords:", bcryptErr);
        return res.status(500).json({ error: "Internal Server Error" });
      }

      if (!isMatch) {
        return res.status(401).json({ error: "Invalid username or password." });
      }

      // Save admin info in the session
      req.session.admin = {
        id: admin.id,
        username: admin.username,
        role: admin.role
      };

      return res.status(200).json({
        message: "Login successful!",
        admin: {
          id: admin.id,
          username: admin.username,
          role: admin.role
        },
      });
    });
  });
};

// Create new admin (Super admin only)
exports.createAdmin = [
  checkRole(['super_admin']),
  async (req, res) => {
    const { username, password, role, firstname, lastname, phone_number } = req.body;

    // Validate required fields
    if (!username || !password || !role || !firstname || !lastname || !phone_number) {
      return res.status(400).json({
        error: "Username, password, role, firstname, lastname, and phone number are required.",
      });
    }

    if (!['super_admin', 'support_admin', 'finance_admin'].includes(role)) {
      return res.status(400).json({
        error: "Invalid role specified.",
      });
    }

    try {
      // Check if username already exists
      const checkQuery = 'SELECT id FROM admin WHERE username = ?';
      const existingAdmin = await new Promise((resolve, reject) => {
        db.query(checkQuery, [username], (err, results) => {
          if (err) reject(err);
          resolve(results);
        });
      });

      if (existingAdmin && existingAdmin.length > 0) {
        return res.status(409).json({
          error: "Username already exists",
          message: `The username '${username}' is already taken. Please choose a different username.`,
        });
      }

      // Hash the password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Insert the new admin
      const query = `
        INSERT INTO admin (username, password, role, firstname, lastname, phone_number)
        VALUES (?, ?, ?, ?, ?, ?)
      `;

      db.query(
        query,
        [username, hashedPassword, role, firstname, lastname, phone_number],
        (err, result) => {
          if (err) {
            // Handle duplicate entry error
            if (err.code === 'ER_DUP_ENTRY') {
              return res.status(409).json({
                error: "Username already exists",
                message: `The username '${username}' is already taken. Please choose a different username.`,
              });
            }
            console.error("Error creating admin:", err);
            return res.status(500).json({ error: "Internal Server Error" });
          }

          res.status(201).json({
            message: "Admin created successfully",
            admin: {
              id: result.insertId,
              username,
              role,
              firstname,
              lastname,
              phone_number,
            },
          });
        }
      );
    } catch (error) {
      console.error("Error creating admin:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "An error occurred while creating the admin account.",
      });
    }
  },
];


// Get all quotations (Super admin and Support admin)
exports.getAllQuotations = [
  checkRole(['super_admin', 'support_admin', 'finance_admin']),
  async (req, res) => {
    // Retrieve query parameters
    const { type, status, startDate, endDate, page = 1, limit = 20, search } = req.query;

    // Define queries for all quotation tables
    const queries = {
      companyRelocation: `
        SELECT *, 'company_relocation' AS type FROM company_relocation
      `,
      moveOutCleaning: `
        SELECT *, 'move_out_cleaning' AS type FROM move_out_cleaning
      `,
      storage: `
        SELECT *, 'storage' AS type FROM storage
      `,
      heavyLifting: `
        SELECT *, 'heavy_lifting' AS type FROM heavy_lifting
      `,
      carryingAssistance: `
        SELECT *, 'carrying_assistance' AS type FROM carrying_assistance
      `,
      junkRemoval: `
        SELECT *, 'junk_removal' AS type FROM junk_removal
      `,
      estateClearance: `
        SELECT *, 'estate_clearance' AS type FROM estate_clearance
      `,
      evacuationMove: `
        SELECT *, 'evacuation_move' AS type FROM evacuation_move
      `,
      privacyMove: `
        SELECT *, 'privacy_move' AS type FROM privacy_move
      `,
    };

    // Filter queries by type if specified
    const filteredQueries = type
      ? Object.entries(queries)
          .filter(([key]) => key === type)
          .reduce((acc, [key, query]) => ({ ...acc, [key]: query }), {})
      : queries;

    // Build WHERE conditions dynamically
    const conditions = [];
    const queryParams = [];

    if (status) {
      conditions.push('status = ?');
      queryParams.push(status);
    }

    if (startDate) {
      conditions.push('created_at >= ?');
      queryParams.push(startDate);
    }

    if (endDate) {
      conditions.push('created_at <= ?');
      queryParams.push(endDate);
    }

    // Add search condition for from_city and to_city
    if (search) {
      conditions.push('(from_city LIKE ? OR to_city LIKE ?)');
      queryParams.push(`%${search}%`, `%${search}%`);
    }

    // Add WHERE clause to each query
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const paginatedQueries = Object.entries(filteredQueries).reduce(
      (acc, [key, query]) => ({
        ...acc,
        [key]: `${query} ${whereClause} LIMIT ? OFFSET ?`,
      }),
      {}
    );

    // Calculate offset for pagination
    const offset = (page - 1) * limit;

    try {
      // Execute count queries to get the total number of records
      const countQueries = Object.entries(filteredQueries).reduce(
        (acc, [key, query]) => ({
          ...acc,
          [key]: `SELECT COUNT(*) AS count FROM (${query} ${whereClause}) AS subquery`,
        }),
        {}
      );

      const totalCounts = await Promise.all(
        Object.entries(countQueries).map(([key, query]) => {
          return new Promise((resolve, reject) => {
            db.query(query, queryParams, (err, rows) => {
              if (err) {
                console.error(`Error fetching count from ${key}:`, err);
                return reject(err);
              }
              resolve(rows[0].count);
            });
          });
        })
      );

      const totalRecords = totalCounts.reduce((acc, count) => acc + count, 0);

      // Execute paginated queries
      const results = [];
      await Promise.all(
        Object.entries(paginatedQueries).map(([key, query]) => {
          return new Promise((resolve, reject) => {
            db.query(query, [...queryParams, parseInt(limit), parseInt(offset)], (err, rows) => {
              if (err) {
                console.error(`Error fetching data from ${key}:`, err);
                return reject(err);
              }
              results.push(...rows);
              resolve();
            });
          });
        })
      );

      // Sort results by created_at to ensure correct pagination
      results.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      // Paginate the combined results
      const paginatedResults = results.slice(0, limit);

      return res.status(200).json({
        message: "Quotations fetched successfully!",
        total: totalRecords,
        page: parseInt(page),
        limit: parseInt(limit),
        data: paginatedResults,
      });
    } catch (err) {
      console.error("Error fetching quotations:", err);
      return res.status(500).json({ error: "Internal Server Error: Unable to fetch data." });
    }
  },
];

// search for the quotation using id and location
exports.searchQuotations = [
  checkRole(['super_admin', 'support_admin', 'finance_admin']),
  async (req, res) => {
    const { search, page = 1, limit = 20 } = req.body;

    if (!search || search.trim() === '') {
      return res.status(400).json({ error: 'Search input is required.' });
    }

    const searchInput = `%${search.trim()}%`;

    try {
      // Define queries for all quotation tables
      const queries = {
        companyRelocation: `
          SELECT *, 'company_relocation' AS type 
          FROM company_relocation
          WHERE id LIKE ? OR from_city LIKE ? OR to_city LIKE ?
        `,
        moveOutCleaning: `
          SELECT *, 'move_out_cleaning' AS type 
          FROM move_out_cleaning
          WHERE id LIKE ? OR from_city LIKE ? OR to_city LIKE ?
        `,
        storage: `
          SELECT *, 'storage' AS type 
          FROM storage
          WHERE id LIKE ? OR from_city LIKE ? OR to_city LIKE ?
        `,
        heavyLifting: `
          SELECT *, 'heavy_lifting' AS type 
          FROM heavy_lifting
          WHERE id LIKE ? OR from_city LIKE ? OR to_city LIKE ?
        `,
        carryingAssistance: `
          SELECT *, 'carrying_assistance' AS type 
          FROM carrying_assistance
          WHERE id LIKE ? OR from_city LIKE ? OR to_city LIKE ?
        `,
        junkRemoval: `
          SELECT *, 'junk_removal' AS type 
          FROM junk_removal
          WHERE id LIKE ? OR from_city LIKE ? OR to_city LIKE ?
        `,
        estateClearance: `
          SELECT *, 'estate_clearance' AS type 
          FROM estate_clearance
          WHERE id LIKE ? OR from_city LIKE ? OR to_city LIKE ?
        `,
        evacuationMove: `
          SELECT *, 'evacuation_move' AS type 
          FROM evacuation_move
          WHERE id LIKE ? OR from_city LIKE ? OR to_city LIKE ?
        `,
        privacyMove: `
          SELECT *, 'privacy_move' AS type 
          FROM privacy_move
          WHERE id LIKE ? OR from_city LIKE ? OR to_city LIKE ?
        `,
      };

      // Execute count queries to get the total number of records
      const countQueries = Object.entries(queries).reduce(
        (acc, [key, query]) => ({
          ...acc,
          [key]: `SELECT COUNT(*) AS count FROM (${query}) AS subquery`,
        }),
        {}
      );

      const totalCounts = await Promise.all(
        Object.entries(countQueries).map(([key, query]) => {
          return new Promise((resolve, reject) => {
            db.query(query, [searchInput, searchInput, searchInput], (err, rows) => {
              if (err) {
                console.error(`Error fetching count from ${key}:`, err);
                return reject(err);
              }
              resolve(rows[0].count);
            });
          });
        })
      );

      const totalRecords = totalCounts.reduce((acc, count) => acc + count, 0);
      const totalPages = Math.ceil(totalRecords / limit);

      // Calculate offset for pagination
      const offset = (page - 1) * limit;

      // Execute paginated queries
      const results = [];
      await Promise.all(
        Object.entries(queries).map(([key, query]) => {
          return new Promise((resolve, reject) => {
            const paginatedQuery = `${query} LIMIT ? OFFSET ?`;
            db.query(paginatedQuery, [searchInput, searchInput, searchInput, parseInt(limit), parseInt(offset)], (err, rows) => {
              if (err) {
                console.error(`Error fetching data from ${key}:`, err);
                return reject(err);
              }
              results.push(...rows); // Append the results to a single array
              resolve();
            });
          });
        })
      );

      // Sort results by created_at
      results.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      // Respond with the search results
      return res.status(200).json({
        message: 'Search completed successfully!',
        total: totalRecords,
        totalPages: totalPages,
        page: parseInt(page),
        limit: parseInt(limit),
        data: results,
      });
    } catch (err) {
      console.error('Error executing search:', err);
      return res.status(500).json({ error: 'Internal Server Error: Unable to execute search.' });
    }
  },
];






// get recent admin activities (Super admin, Support admin, Finance admin)
exports.getRecentAdminActivities = [
  checkRole(['super_admin', 'support_admin', 'finance_admin']),
  async (req, res) => {
    try {
      const query = `
        SELECT 
          title, 
          message, 
          type, 
          reference_id, 
          reference_type, 
          created_at 
        FROM notifications 
        WHERE recipient_type = 'admin' 
        ORDER BY created_at DESC 
        LIMIT 5
      `;

      const activities = await new Promise((resolve, reject) => {
        db.query(query, [], (err, results) => {
          if (err) {
            console.error("Error fetching recent activities:", err);
            reject(err);
          }
          resolve(results);
        });
      });

      res.status(200).json({
        message: "Recent admin activities fetched successfully!",
        activities,
      });
    } catch (error) {
      console.error("Error fetching recent activities:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Unable to fetch recent activities.",
      });
    }
  },
];




// Get all bids (All admin roles)
exports.allBids = [
  checkRole(['super_admin', 'support_admin', 'finance_admin']),
  (req, res) => {
    const { status, startDate, endDate, page = 1, limit = 10 } = req.query; // Pagination and filters

    const offset = (page - 1) * limit;

    // Base query
    let query = `
      SELECT 
        b.*, 
        s.company_name AS supplier_name 
      FROM bids b
      LEFT JOIN suppliers s ON b.supplier_id = s.id
      WHERE 1 = 1
    `;

    // Add filters dynamically
    const queryParams = [];
    if (status) {
      query += ` AND b.status = ?`;
      queryParams.push(status);
    }
    if (startDate) {
      query += ` AND b.created_at >= ?`;
      queryParams.push(startDate);
    }
    if (endDate) {
      query += ` AND b.created_at <= ?`;
      queryParams.push(endDate);
    }

    // Add pagination
    query += ` ORDER BY b.created_at DESC LIMIT ? OFFSET ?`;
    queryParams.push(Number(limit), Number(offset));

    // Total count query for pagination metadata
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM bids b
      LEFT JOIN suppliers s ON b.supplier_id = s.id
      WHERE 1 = 1
    `;
    const countParams = [...queryParams.slice(0, -2)]; // Remove LIMIT and OFFSET for count query

    // Execute both queries
    const bidsPromise = new Promise((resolve, reject) => {
      db.query(query, queryParams, (err, results) => {
        if (err) reject(err);
        resolve(results);
      });
    });

    const countPromise = new Promise((resolve, reject) => {
      db.query(countQuery, countParams, (err, results) => {
        if (err) reject(err);
        resolve(results[0].total);
      });
    });

    Promise.all([bidsPromise, countPromise])
      .then(([rows, total]) => {
        const formattedRows = rows.map(row => ({
          ...row,
          type: 'bid', // Add a fixed type for each result
        }));

        res.status(200).json({
          message: "Bids fetched successfully!",
          total, // Total number of results
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(total / limit),
          data: formattedRows,
        });
      })
      .catch(err => {
        console.error("Error fetching bids:", err);
        res.status(500).json({
          error: "Internal Server Error: Unable to fetch bids.",
        });
      });
  },
];

// search bids
exports.searchBids = [
  checkRole(['super_admin', 'support_admin', 'finance_admin']),
  async (req, res) => {
    const { search } = req.body; // Single search input
    const { page = 1, limit = 20 } = req.query; // Pagination parameters

    if (!search || search.trim() === '') {
      return res.status(400).json({ error: 'Search input is required.' });
    }

    const searchInput = `%${search.trim()}%`;
    const offset = (page - 1) * limit;

    try {
      // Base query for fetching bids
      const searchQuery = `
        SELECT 
          b.*, 
          s.company_name AS supplier_name,
          'bid' AS type
        FROM bids b
        LEFT JOIN suppliers s ON b.supplier_id = s.id
        WHERE 
          b.id LIKE ? OR
          s.company_name LIKE ? OR
          b.bid_price LIKE ?
        ORDER BY b.created_at DESC
        LIMIT ? OFFSET ?
      `;

      // Query to count the total number of matching bids
      const countQuery = `
        SELECT COUNT(*) AS total
        FROM bids b
        LEFT JOIN suppliers s ON b.supplier_id = s.id
        WHERE 
          b.id LIKE ? OR
          s.company_name LIKE ? OR
          b.bid_price LIKE ?
      `;

      // Execute the queries
      const bidsPromise = new Promise((resolve, reject) => {
        db.query(
          searchQuery,
          [searchInput, searchInput, searchInput, parseInt(limit), parseInt(offset)],
          (err, results) => {
            if (err) {
              console.error('Error fetching bids:', err);
              return reject(err);
            }
            resolve(results);
          }
        );
      });

      const countPromise = new Promise((resolve, reject) => {
        db.query(
          countQuery,
          [searchInput, searchInput, searchInput],
          (err, results) => {
            if (err) {
              console.error('Error fetching bid count:', err);
              return reject(err);
            }
            resolve(results[0].total);
          }
        );
      });

      // Await both queries
      const [bids, total] = await Promise.all([bidsPromise, countPromise]);

      // Respond with paginated results
      res.status(200).json({
        message: 'Search completed successfully!',
        total, // Total matching records
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit), // Total pages
        data: bids,
      });
    } catch (error) {
      console.error('Error executing bid search:', error);
      res.status(500).json({
        error: 'Internal Server Error: Unable to execute search.',
      });
    }
  },
];


// get all bids and quotations (all admin)
exports.fetchQuotationsAndBids = [
  checkRole(['super_admin', 'support_admin', 'finance_admin']),
  async (req, res) => {
    try {
      const { page = 1, limit = 20 } = req.query; // Default to page 1 and limit 20
      const offset = (page - 1) * limit;

      // Queries for fetching all quotations
      const quotationQueries = {
        companyRelocation: `
          SELECT * FROM company_relocation
          LIMIT ? OFFSET ?
        `,
        moveOutCleaning: `
          SELECT * FROM move_out_cleaning
          LIMIT ? OFFSET ?
        `,
        storage: `
          SELECT * FROM storage
          LIMIT ? OFFSET ?
        `,
        heavyLifting: `
          SELECT * FROM heavy_lifting
          LIMIT ? OFFSET ?
        `,
        carryingAssistance: `
          SELECT * FROM carrying_assistance
          LIMIT ? OFFSET ?
        `,
        junkRemoval: `
          SELECT * FROM junk_removal
          LIMIT ? OFFSET ?
        `,
        estateClearance: `
          SELECT * FROM estate_clearance
          LIMIT ? OFFSET ?
        `,
        evacuationMove: `
          SELECT * FROM evacuation_move
          LIMIT ? OFFSET ?
        `,
        privacyMove: `
          SELECT * FROM privacy_move
          LIMIT ? OFFSET ?
        `,
      };

      // Fetch all quotations with pagination
      const quotationResults = {};
      const quotationPromises = Object.entries(quotationQueries).map(
        ([key, query]) => {
          return new Promise((resolve, reject) => {
            db.query(query, [parseInt(limit), parseInt(offset)], (err, rows) => {
              if (err) {
                console.error(`Error fetching data from ${key}:`, err);
                return reject(err);
              }
              quotationResults[key] = rows; // Store the result for each table
              resolve();
            });
          });
        }
      );

      // Query to fetch all bids with supplier names and pagination
      const bidsQuery = `
        SELECT 
          b.*, 
          s.company_name AS supplier_name 
        FROM bids b
        LEFT JOIN suppliers s ON b.supplier_id = s.id
        ORDER BY b.created_at DESC
        LIMIT ? OFFSET ?
      `;

      const bidsPromise = new Promise((resolve, reject) => {
        db.query(bidsQuery, [parseInt(limit), parseInt(offset)], (err, rows) => {
          if (err) {
            console.error("Error fetching bids:", err);
            return reject(err);
          }
          resolve(rows);
        });
      });

      // Wait for all queries to complete
      const [bids] = await Promise.all([bidsPromise, ...quotationPromises]);

      // Respond with the fetched data
      res.status(200).json({
        message: "Quotations and bids fetched successfully!",
        pagination: {
          currentPage: parseInt(page),
          limit: parseInt(limit),
        },
        data: {
          quotations: quotationResults,
          bids,
        },
      });
    } catch (error) {
      console.error("Error fetching quotations and bids:", error);
      res.status(500).json({
        error: "Internal Server Error: Unable to fetch data.",
      });
    }
  },
];

// literal counts of all bids, quotation, dispute
exports.getTotalCounts = [
  checkRole(['super_admin', 'support_admin', 'finance_admin']),
  async (req, res) => {
    try {
      // Queries to count rows in each table
      const countQueries = {
        conversations: `
          SELECT COUNT(*) AS total FROM conversations
        `,
        bids: `
          SELECT 
            COUNT(*) AS total,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
            SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) AS accepted,
            SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected
          FROM bids
        `,
        quotations: `
          SELECT 
            (SELECT COUNT(*) FROM company_relocation) +
            (SELECT COUNT(*) FROM move_out_cleaning) +
            (SELECT COUNT(*) FROM storage) +
            (SELECT COUNT(*) FROM heavy_lifting) +
            (SELECT COUNT(*) FROM carrying_assistance) +
            (SELECT COUNT(*) FROM junk_removal) +
            (SELECT COUNT(*) FROM estate_clearance) +
            (SELECT COUNT(*) FROM evacuation_move) +
            (SELECT COUNT(*) FROM privacy_move) AS total,
            (
              (SELECT COUNT(*) FROM company_relocation WHERE status = 'awarded') +
              (SELECT COUNT(*) FROM move_out_cleaning WHERE status = 'awarded') +
              (SELECT COUNT(*) FROM storage WHERE status = 'awarded') +
              (SELECT COUNT(*) FROM heavy_lifting WHERE status = 'awarded') +
              (SELECT COUNT(*) FROM carrying_assistance WHERE status = 'awarded') +
              (SELECT COUNT(*) FROM junk_removal WHERE status = 'awarded') +
              (SELECT COUNT(*) FROM estate_clearance WHERE status = 'awarded') +
              (SELECT COUNT(*) FROM evacuation_move WHERE status = 'awarded') +
              (SELECT COUNT(*) FROM privacy_move WHERE status = 'awarded')
            ) AS awarded,
            (
              (SELECT COUNT(*) FROM company_relocation WHERE status = 'open') +
              (SELECT COUNT(*) FROM move_out_cleaning WHERE status = 'open') +
              (SELECT COUNT(*) FROM storage WHERE status = 'open') +
              (SELECT COUNT(*) FROM heavy_lifting WHERE status = 'open') +
              (SELECT COUNT(*) FROM carrying_assistance WHERE status = 'open') +
              (SELECT COUNT(*) FROM junk_removal WHERE status = 'open') +
              (SELECT COUNT(*) FROM estate_clearance WHERE status = 'open') +
              (SELECT COUNT(*) FROM evacuation_move WHERE status = 'open') +
              (SELECT COUNT(*) FROM privacy_move WHERE status = 'open')
            ) AS open
        `,
        quotationsAndBids: `
          SELECT 
            (
              (SELECT COUNT(*) FROM company_relocation) +
              (SELECT COUNT(*) FROM move_out_cleaning) +
              (SELECT COUNT(*) FROM storage) +
              (SELECT COUNT(*) FROM heavy_lifting) +
              (SELECT COUNT(*) FROM carrying_assistance) +
              (SELECT COUNT(*) FROM junk_removal) +
              (SELECT COUNT(*) FROM estate_clearance) +
              (SELECT COUNT(*) FROM evacuation_move) +
              (SELECT COUNT(*) FROM privacy_move)
            ) + (SELECT COUNT(*) FROM bids) AS total
        `,
      };

      // Execute all queries concurrently
      const results = {};
      const queryPromises = Object.entries(countQueries).map(([key, query]) => {
        return new Promise((resolve, reject) => {
          db.query(query, (err, rows) => {
            if (err) {
              console.error(`Error fetching count for ${key}:`, err);
              return reject(err);
            }
            results[key] = rows[0]; // Extract the total count and status counts
            resolve();
          });
        });
      });

      // Wait for all queries to complete
      await Promise.all(queryPromises);

      // Return the results
      res.status(200).json({
        message: "Counts fetched successfully.",
        data: results,
      });
    } catch (error) {
      console.error('Error fetching total counts:', error);
      res.status(500).json({
        error: "Internal Server Error: Unable to fetch counts.",
      });
    }
  },
];

// getting orders
exports.orders = [
  checkRole(['super_admin', 'support_admin', 'finance_admin']),
  async (req, res) => {
    const { type, status, location, startDate, endDate, page = 1, limit = 20 } = req.query;

    try {
      // Base query for orders
      let query = `
        SELECT 
          q.id AS order_id,
          c.fullname AS customer_name,
          c.email AS customer_email,
          c.phone_num AS customer_phone,
          q.type AS quotation_type,
          q.created_at AS date,
          q.to_city AS location,
          s.company_name AS mover,
          b.bid_price AS bids,
          b.payment_method,
          (b.bid_price + (b.bid_price * 0.1)) AS total_amount, -- Assuming a 10% markup
          b.status
        FROM bids b
        INNER JOIN (
          SELECT 
            id, 
            'company_relocation' AS type, 
            to_city, 
            created_at, 
            email_address 
          FROM company_relocation
          UNION ALL
          SELECT id, 'move_out_cleaning', to_city, created_at, email_address FROM move_out_cleaning
          UNION ALL
          SELECT id, 'storage', to_city, created_at, email_address FROM storage
          UNION ALL
          SELECT id, 'heavy_lifting', to_city, created_at, email_address FROM heavy_lifting
          UNION ALL
          SELECT id, 'carrying_assistance', to_city, created_at, email_address FROM carrying_assistance
          UNION ALL
          SELECT id, 'junk_removal', to_city, created_at, email_address FROM junk_removal
          UNION ALL
          SELECT id, 'estate_clearance', to_city, created_at, email_address FROM estate_clearance
          UNION ALL
          SELECT id, 'evacuation_move', to_city, created_at, email_address FROM evacuation_move
          UNION ALL
          SELECT id, 'privacy_move', to_city, created_at, email_address FROM privacy_move
        ) q ON b.quotation_id = q.id AND b.quotation_type = q.type
        INNER JOIN customers c ON q.email_address = c.email
        LEFT JOIN suppliers s ON b.supplier_id = s.id
        WHERE 1=1
      `;

      // Dynamic filters
      const queryParams = [];
      if (type) {
        query += ' AND q.type = ?';
        queryParams.push(type);
      }
      if (status) {
        query += ' AND b.status = ?';
        queryParams.push(status);
      }
      if (location) {
        query += ' AND q.to_city LIKE ?';
        queryParams.push(`%${location}%`);
      }
      if (startDate) {
        query += ' AND q.created_at >= ?';
        queryParams.push(startDate);
      }
      if (endDate) {
        query += ' AND q.created_at <= ?';
        queryParams.push(endDate);
      }

      // Pagination
      const offset = (page - 1) * limit;
      const countQuery = `
        SELECT COUNT(*) AS total 
        FROM (${query}) AS orders
      `;
      query += ' ORDER BY q.created_at DESC LIMIT ? OFFSET ?';
      queryParams.push(Number(limit), Number(offset));

      // Fetch total count for pagination
      const totalRecords = await new Promise((resolve, reject) => {
        db.query(countQuery, queryParams.slice(0, -2), (err, results) => {
          if (err) {
            console.error('Error fetching total count:', err);
            return reject(err);
          }
          resolve(results[0].total);
        });
      });

      // Fetch paginated orders
      const orders = await new Promise((resolve, reject) => {
        db.query(query, queryParams, (err, results) => {
          if (err) {
            console.error('Error fetching orders:', err);
            return reject(err);
          }
          resolve(results);
        });
      });

      // Calculate total pages
      const totalPages = Math.ceil(totalRecords / limit);

      res.status(200).json({
        message: 'Orders fetched successfully!',
        total: totalRecords,
        totalPages,
        page: Number(page),
        limit: Number(limit),
        data: orders,
      });
    } catch (error) {
      console.error('Error fetching orders:', error);
      res.status(500).json({
        error: 'Internal Server Error: Unable to fetch orders.',
      });
    }
  },
];

// searching orders
exports.searchOrders = [
  checkRole(['super_admin', 'support_admin', 'finance_admin']),
  async (req, res) => {
    const { search, page = 1, limit = 20 } = req.body; // Input search keyword, pagination

    try {
      // Base query for orders
      let query = `
        SELECT 
          q.id AS order_id,
          c.fullname AS customer_name,
          c.email AS customer_email,
          c.phone_num AS customer_phone,
          q.type AS quotation_type,
          q.created_at AS date,
          q.to_city AS location,
          s.company_name AS mover,
          b.bid_price AS bids,
          b.payment_method,
          (b.bid_price + (b.bid_price * 0.1)) AS total_amount, -- Assuming a 10% markup
          b.status
        FROM bids b
        INNER JOIN (
          SELECT 
            id, 
            'company_relocation' AS type, 
            to_city, 
            created_at, 
            email_address 
          FROM company_relocation
          UNION ALL
          SELECT id, 'move_out_cleaning', to_city, created_at, email_address FROM move_out_cleaning
          UNION ALL
          SELECT id, 'storage', to_city, created_at, email_address FROM storage
          UNION ALL
          SELECT id, 'heavy_lifting', to_city, created_at, email_address FROM heavy_lifting
          UNION ALL
          SELECT id, 'carrying_assistance', to_city, created_at, email_address FROM carrying_assistance
          UNION ALL
          SELECT id, 'junk_removal', to_city, created_at, email_address FROM junk_removal
          UNION ALL
          SELECT id, 'estate_clearance', to_city, created_at, email_address FROM estate_clearance
          UNION ALL
          SELECT id, 'evacuation_move', to_city, created_at, email_address FROM evacuation_move
          UNION ALL
          SELECT id, 'privacy_move', to_city, created_at, email_address FROM privacy_move
        ) q ON b.quotation_id = q.id AND b.quotation_type = q.type
        INNER JOIN customers c ON q.email_address = c.email
        LEFT JOIN suppliers s ON b.supplier_id = s.id
        WHERE 1=1
      `;

      // Dynamic search filter
      const queryParams = [];
      if (search) {
        query += `
          AND (
            q.id LIKE ? OR
            c.fullname LIKE ? OR
            q.type LIKE ? OR
            q.to_city LIKE ? OR
            s.company_name LIKE ? OR
            b.status LIKE ?
          )
        `;
        const searchKeyword = `%${search}%`;
        queryParams.push(
          searchKeyword, // Match `order_id`
          searchKeyword, // Match `customer_name`
          searchKeyword, // Match `quotation_type`
          searchKeyword, // Match `location`
          searchKeyword, // Match `mover`
          searchKeyword  // Match `status`
        );
      }

      // Pagination
      const offset = (page - 1) * limit;
      const countQuery = `
        SELECT COUNT(*) AS total 
        FROM (${query}) AS orders
      `;
      query += ' ORDER BY q.created_at DESC LIMIT ? OFFSET ?';
      queryParams.push(Number(limit), Number(offset));

      // Fetch total count for pagination
      const totalRecords = await new Promise((resolve, reject) => {
        db.query(countQuery, queryParams.slice(0, -2), (err, results) => {
          if (err) {
            console.error('Error fetching total count:', err);
            return reject(err);
          }
          resolve(results[0].total);
        });
      });

      // Fetch paginated search results
      const orders = await new Promise((resolve, reject) => {
        db.query(query, queryParams, (err, results) => {
          if (err) {
            console.error('Error fetching orders:', err);
            return reject(err);
          }
          resolve(results);
        });
      });

      // Calculate total pages
      const totalPages = Math.ceil(totalRecords / limit);

      res.status(200).json({
        message: 'Search results fetched successfully!',
        total: totalRecords,
        totalPages,
        page: Number(page),
        limit: Number(limit),
        data: orders,
      });
    } catch (error) {
      console.error('Error fetching search results:', error);
      res.status(500).json({
        error: 'Internal Server Error: Unable to fetch search results.',
      });
    }
  },
];



// get completed payments total
exports.getMonthlyBidsTotal = [
  checkRole(['super_admin', 'support_admin', 'finance_admin']),
  async (req, res) => {
    try {
      // Fetch the earliest and latest months with bids
      const rangeQuery = `
        SELECT 
          MIN(DATE_FORMAT(created_at, '%Y-%m-01')) AS start_date, 
          MAX(DATE_FORMAT(created_at, '%Y-%m-01')) AS end_date
        FROM bids
        WHERE payment_status = 'completed'
      `;

      const { start_date, end_date } = await new Promise((resolve, reject) => {
        db.query(rangeQuery, (err, results) => {
          if (err) reject(err);
          resolve(results[0]);
        });
      });

      if (!start_date || !end_date) {
        return res.status(200).json({
          message: 'No completed bids available.',
          data: [],
        });
      }

      // Generate all months between the start_date and end_date
      const startDate = new Date(start_date);
      const endDate = new Date(end_date);
      const totalMonths = differenceInCalendarMonths(endDate, startDate) + 1;

      const allMonths = Array.from({ length: totalMonths }, (_, i) => {
        const date = addMonths(startDate, i);
        return {
          month: format(date, 'MMMM'), // Full month name
          year: format(date, 'yyyy'), // Year
        };
      });

      // Fetch data for completed bids grouped by month and year
      const query = `
        SELECT 
          DATE_FORMAT(created_at, '%M') AS month, 
          DATE_FORMAT(created_at, '%Y') AS year,
          SUM(total_price) AS total_price_sek
        FROM bids
        WHERE payment_status = 'completed'
        GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      `;

      const bidData = await new Promise((resolve, reject) => {
        db.query(query, (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        });
      });

      // Map bid data for easy lookup
      const bidMap = bidData.reduce((map, { month, year, total_price_sek }) => {
        map[`${month}-${year}`] = total_price_sek;
        return map;
      }, {});

      // Ensure all months in the range are included with zero values where needed
      const filledData = allMonths.map(({ month, year }) => ({
        month,
        year,
        total_price_sek: bidMap[`${month}-${year}`] || 0,
      }));

      res.status(200).json({
        message: 'Monthly completed bids total fetched successfully.',
        data: filledData,
      });
    } catch (error) {
      console.error('Error fetching monthly completed bids total:', error);
      res.status(500).json({
        error: 'Internal Server Error: Unable to fetch monthly completed bids total.',
      });
    }
  },
];

// Edit accepted bid (Super admin and Finance admin)
exports.editAcceptedBid = [
  checkRole(['super_admin', 'finance_admin']),
  (req, res) => {
    const { bid_id, commission_percentage } = req.body;

    if (!bid_id || commission_percentage === undefined) {
      return res.status(400).json({
        error: "Bid ID and commission percentage are required.",
      });
    }

    if (isNaN(commission_percentage) || commission_percentage <= 0) {
      return res.status(400).json({
        error: "Commission percentage must be a positive number.",
      });
    }

    const checkBidQuery = `
      SELECT 
        b.*, 
        b.bid_price AS amount, 
        s.email AS supplier_email, 
        s.company_name AS supplier_name,
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
      JOIN suppliers s ON b.supplier_id = s.id
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

    db.query(checkBidQuery, [bid_id], async (checkErr, bids) => {
      if (checkErr) {
        console.error("Error fetching bid:", checkErr);
        return res.status(500).json({ error: "Internal Server Error" });
      }

      if (bids.length === 0) {
        return res.status(404).json({ error: "Bid not found or already processed." });
      }

      const bid = bids[0];

      // Ensure the bid amount is valid
      if (!bid.amount || isNaN(bid.amount) || bid.amount <= 0) {
        return res.status(400).json({
          error: "Invalid bid amount.",
        });
      }

      const finalPrice = bid.amount * (1 + commission_percentage / 100);

      // Add new query to reject other bids
      const rejectOtherBidsQuery = `
        UPDATE bids 
        SET status = 'rejected'
        WHERE quotation_id = ? 
        AND quotation_type = ?
        AND id != ?
        AND status = 'pending'
      `;

      const updateBidQuery = `
        UPDATE bids
        SET status = 'accepted', total_price = ?
        WHERE id = ?
      `;

      const updateQuotationQuery = `
        UPDATE ${bid.quotation_type}
        SET status = 'awarded'
        WHERE id = ?
      `;

      const insertCommissionQuery = `
        INSERT INTO admin_commission (bid_id, commission_percentage, final_price)
        VALUES (?, ?, ?)
      `;

      // Execute queries in sequence with proper error handling
      db.query(rejectOtherBidsQuery, [bid.quotation_id, bid.quotation_type, bid_id], (rejectErr) => {
        if (rejectErr) {
          console.error("Error rejecting other bids:", rejectErr);
          return res.status(500).json({ error: "Internal Server Error" });
        }

        db.query(updateBidQuery, [finalPrice, bid_id], (updateBidErr) => {
          if (updateBidErr) {
            console.error("Error updating bid:", updateBidErr);
            return res.status(500).json({ error: "Internal Server Error" });
          }

          db.query(updateQuotationQuery, [bid.quotation_id], (updateQuotationErr) => {
            if (updateQuotationErr) {
              console.error("Error updating quotation:", updateQuotationErr);
              return res.status(500).json({ error: "Internal Server Error" });
            }

            db.query(insertCommissionQuery, [bid_id, commission_percentage, finalPrice], async (commissionErr) => {
              if (commissionErr) {
                console.error("Error inserting commission:", commissionErr);
                return res.status(500).json({ error: "Internal Server Error" });
              }

              // Get rejected suppliers for notification
              const getRejectedBidsQuery = `
                SELECT b.id, s.email AS supplier_email, s.company_name AS supplier_name
                FROM bids b
                JOIN suppliers s ON b.supplier_id = s.id
                WHERE b.quotation_id = ?
                AND b.quotation_type = ?
                AND b.id != ?
                AND b.status = 'rejected'
              `;

              db.query(getRejectedBidsQuery, [bid.quotation_id, bid.quotation_type, bid_id], async (rejectedErr, rejectedBids) => {
                if (rejectedErr) {
                  console.error("Error fetching rejected bids:", rejectedErr);
                }

                // Notify accepted supplier
                try {
                  await emailService.sendEmail(
                    bid.supplier_email,
                    {
                      subject: `Your Bid for ${bid.quotation_type} Has Been Accepted`,
                      html: `
                        <p>Dear ${bid.supplier_name},</p>
                        <p>Your bid for ${bid.quotation_type} has been accepted. The bid price is $${bid.amount.toFixed(2)}.</p>
                        <p>Please proceed with the next steps.</p>
                      `,
                    }
                  );

                  await notificationService.createNotification({
                    recipientId: bid.supplier_email,
                    recipientType: "supplier",
                    title: "Bid Accepted",
                    message: `Your bid for ${bid.quotation_type} has been accepted. Your bid price is $${bid.amount.toFixed(2)}.`,
                    type: "bid_accepted",
                    referenceId: bid_id,
                    referenceType: "bid",
                  });

                  // Notify rejected suppliers
                  for (const rejectedBid of rejectedBids) {
                    await emailService.sendEmail(
                      rejectedBid.supplier_email,
                      {
                        subject: `Bid Status Update for ${bid.quotation_type}`,
                        html: `
                          <p>Dear ${rejectedBid.supplier_name},</p>
                          <p>We regret to inform you that your bid for ${bid.quotation_type} was not selected.</p>
                          <p>Thank you for participating in the bidding process.</p>
                        `,
                      }
                    );

                    await notificationService.createNotification({
                      recipientId: rejectedBid.supplier_email,
                      recipientType: "supplier",
                      title: "Bid Status Update",
                      message: `Your bid for ${bid.quotation_type} was not selected.`,
                      type: "bid_rejected",
                      referenceId: rejectedBid.id,
                      referenceType: "bid",
                    });
                  }

                } catch (notificationErr) {
                  console.error("Error sending notifications:", notificationErr);
                }

                res.status(200).json({
                  message: "Bid approved successfully!",
                  finalPrice,
                });
              });
            });
          });
        });
      });
    });
  },
];

// Marketplace management (Super admin only)
exports.marketPlace = [
  checkRole(['super_admin']),
  (req, res) => {
    // Query to fetch all bids with supplier and quotation details
    const query = `
      SELECT 
        b.id AS bid_id,
        b.bid_price,
        b.total_price,
        b.additional_notes,
        b.created_at AS bid_created_at,
        b.quotation_id,
        b.quotation_type,
        s.company_name,
        s.email AS supplier_email,
        q.from_city,
        q.to_city,
        q.move_date,
        q.type_of_service
      FROM bids b
      JOIN suppliers s ON b.supplier_id = s.id
      JOIN (
        SELECT 
          'company_relocation' AS table_name, id, from_city, to_city, move_date, type_of_service FROM company_relocation
        UNION ALL
        SELECT 
          'move_out_cleaning' AS table_name, id, from_city, to_city, move_date, type_of_service FROM move_out_cleaning
        UNION ALL
        SELECT 
          'storage' AS table_name, id, from_city, to_city, move_date, type_of_service FROM storage
        UNION ALL
        SELECT 
          'heavy_lifting' AS table_name, id, from_city, to_city, move_date, type_of_service FROM heavy_lifting
        UNION ALL
        SELECT 
          'carrying_assistance' AS table_name, id, from_city, to_city, move_date, type_of_service FROM carrying_assistance
        UNION ALL
        SELECT 
          'junk_removal' AS table_name, id, from_city, to_city, move_date, type_of_service FROM junk_removal
        UNION ALL
        SELECT 
          'estate_clearance' AS table_name, id, from_city, to_city, move_date, type_of_service FROM estate_clearance
        UNION ALL
        SELECT 
          'evacuation_move' AS table_name, id, from_city, to_city, move_date, type_of_service FROM evacuation_move
        UNION ALL
        SELECT 
          'privacy_move' AS table_name, id, from_city, to_city, move_date, type_of_service FROM privacy_move
      ) q ON b.quotation_id = q.id AND b.quotation_type = q.table_name
    `;

    db.query(query, (err, results) => {
      if (err) {
        console.error("Error fetching marketplace data:", err);
        return res.status(500).json({ error: "Internal Server Error" });
      }

      if (results.length === 0) {
        return res.status(404).json({ message: "No bids or quotations found in the marketplace." });
      }

      return res.status(200).json({
        message: "Marketplace data retrieved successfully.",
        marketplace: results,
      });
    });
  },
];

// Supplier search (All admin roles)
exports.supplierSearch = [
  checkRole(['super_admin', 'support_admin', 'finance_admin']),
  (req, res) => {
    const { company_name } = req.query;

    // Validate input
    if (!company_name || company_name.trim() === "") {
      return res.status(400).json({ error: "Company name is required for search." });
    }

    // SQL query to search for suppliers by company name
    const query = `
      SELECT 
        id, 
        company_name, 
        contact_person, 
        address, 
        postal_code, 
        city, 
        organization_number, 
        started_year, 
        trucks, 
        phone, 
        email, 
        about_us, 
        bank, 
        account_number, 
        iban, 
        swift_code, 
        created_at 
      FROM suppliers 
      WHERE company_name LIKE ?
    `;

    // Execute query with wildcards for partial matching
    db.query(query, [`%${company_name}%`], (err, results) => {
      if (err) {
        console.error("Error searching suppliers:", err);
        return res.status(500).json({ error: "Internal Server Error" });
      }

      if (results.length === 0) {
        return res.status(404).json({ message: "No suppliers found with the provided company name." });
      }

      // Respond with the matching suppliers
      return res.status(200).json({
        message: "Suppliers retrieved successfully.",
        suppliers: results,
      });
    });
  },
];

// Toggle auction mode (Super admin only)
exports.toggleAuctionMode = [
  checkRole(['super_admin']),
  async (req, res) => {
    const { auction_enabled } = req.body;

    if (typeof auction_enabled !== "boolean") {
      return res.status(400).json({
        error: "Invalid input: auction_enabled must be a boolean.",
      });
    }

    try {
      await db.promise().query(`UPDATE settings SET auction_enabled = ?`, [auction_enabled]);
      return res.status(200).json({
        message: `Auction mode successfully ${auction_enabled ? "enabled" : "disabled"}.`,
      });
    } catch (error) {
      console.error("Error updating auction mode:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  },
];

// Funds disbursement (Super admin and Finance admin)
exports.fundsDisbursement = [
  checkRole(['super_admin', 'finance_admin']),
  async (req, res) => {
    const { bid_id } = req.body;

    if (!bid_id) {
      return res.status(400).json({ error: "Bid ID is required." });
    }

    try {
      // Check if the bid exists and is in 'completed' payment status
      const getBidQuery = `
        SELECT 
          b.id AS bid_id,
          b.payment_status,
          s.email AS supplier_email,
          s.company_name AS supplier_name,
          b.total_price
        FROM bids b
        JOIN suppliers s ON b.supplier_id = s.id
        WHERE b.id = ?
      `;

      const [bid] = await new Promise((resolve, reject) => {
        db.query(getBidQuery, [bid_id], (err, results) => {
          if (err) return reject(err);
          resolve(results);
        });
      });

      if (!bid) {
        return res.status(404).json({ error: "Bid not found." });
      }

      if (bid.payment_status !== "completed") {
        return res.status(400).json({
          error: "Funds can only be marked as disbursed for completed payments.",
        });
      }

      // Update the payment status to 'disbursed'
      const updatePaymentStatusQuery = `
        UPDATE bids
        SET disbursement_status = 'disbursed'
        WHERE id = ?
      `;

      await new Promise((resolve, reject) => {
        db.query(updatePaymentStatusQuery, [bid_id], (err) => {
          if (err) return reject(err);
          resolve();
        });
      });

      // Notify the supplier via email
      await emailService.sendEmail(
        bid.supplier_email,
        {
          subject: `Funds Disbursed for Bid #${bid.bid_id}`,
          html: `
            <p>Dear ${bid.supplier_name},</p>
            <p>We are pleased to inform you that the payment for Bid #${bid.bid_id}, amounting to $${bid.total_price.toFixed(
              2
            )}, has been successfully disbursed.</p>
            <p>Please check your account for the transaction.</p>
            <p>Best regards,<br>Your Platform Team</p>
          `,
        }
      );

      // Add an in-app notification for the supplier
      await notificationService.createNotification({
        recipientId: bid.supplier_email,
        recipientType: "supplier",
        title: "Funds Disbursed",
        message: `Payment for Bid #${bid.bid_id} amounting to $${bid.total_price.toFixed(
          2
        )} has been disbursed.`,
        type: "payment",
        referenceId: bid.bid_id,
        referenceType: "bid",
      });

      console.log(
        `Funds disbursed notification sent to supplier for bid ${bid.bid_id}.`
      );

      return res.status(200).json({
        message: `Funds for Bid #${bid.bid_id} have been successfully marked as disbursed.`,
      });
    } catch (error) {
      console.error("Error disbursing funds:", error);
      return res
        .status(500)
        .json({ error: "An error occurred while processing the disbursement." });
    }
  },
];

// Get admin profile
exports.getProfile = [
  checkRole(['super_admin', 'support_admin', 'finance_admin']),
  (req, res) => {
    res.status(200).json({
      admin: {
        id: req.session.admin.id,
        username: req.session.admin.username,
        role: req.session.admin.role
      }
    });
  }
];

// List all admins (Super admin only)
exports.listAdmins = [
  checkRole(['super_admin']),
  (req, res) => {
    const query = `
      SELECT id, username, role, created_at, firstname, lastname, phone_number
      FROM admin 
      WHERE id != ?
    `;

    db.query(query, [req.session.admin.id], (err, results) => {
      if (err) {
        console.error("Error fetching admins:", err);
        return res.status(500).json({ error: "Internal Server Error" });
      }

      res.status(200).json({
        admins: results
      });
    });
  }
];

// delete support and finance admin
exports.deleteAdmins = [
  checkRole(['super_admin']),
  async (req, res) => {
    const { adminId } = req.params; // Admin ID to be deleted
    const deletingAdmin = req.session.admin.username; // Admin performing the action

    if (!adminId) {
      return res.status(400).json({ error: "Admin ID is required." });
    }

    try {
      // Fetch the role of the admin to be deleted
      const fetchRoleQuery = `
        SELECT role, username 
        FROM admin 
        WHERE id = ?
      `;

      const adminDetails = await new Promise((resolve, reject) => {
        db.query(fetchRoleQuery, [adminId], (err, results) => {
          if (err) reject(err);
          resolve(results);
        });
      });

      if (!adminDetails || adminDetails.length === 0) {
        return res.status(404).json({ error: "Admin not found." });
      }

      const { role: adminRole, username: deletedAdminUsername } = adminDetails[0];

      // Ensure the target admin is either a support_admin or finance_admin
      if (!['support_admin', 'finance_admin'].includes(adminRole)) {
        return res.status(403).json({
          error: "Forbidden. You can only delete support or finance admins.",
        });
      }

      // Proceed with deletion
      const deleteQuery = `
        DELETE FROM admin 
        WHERE id = ?
      `;

      const deleteResult = await new Promise((resolve, reject) => {
        db.query(deleteQuery, [adminId], (err, results) => {
          if (err) reject(err);
          resolve(results);
        });
      });

      if (deleteResult.affectedRows === 0) {
        return res.status(404).json({ error: "Admin not found or could not be deleted." });
      }

      // Log deletion into notifications table
      const notificationQuery = `
        INSERT INTO notifications (
          recipient_id, 
          recipient_type, 
          title, 
          message, 
          type, 
          reference_id, 
          reference_type, 
          is_read, 
          created_at
        ) VALUES (?, 'admin', ?, ?, 'admin_deletion', ?, 'admin', FALSE, NOW())
      `;

      const notificationMessage = `Admin '${deletedAdminUsername}' (${adminRole}) was deleted by '${deletingAdmin}'.`;
      const notificationTitle = "Admin Deleted";

      await new Promise((resolve, reject) => {
        db.query(
          notificationQuery,
          [deletingAdmin, notificationTitle, notificationMessage, adminId],
          (err) => {
            if (err) reject(err);
            resolve();
          }
        );
      });

      res.status(200).json({
        message: `Admin '${deletedAdminUsername}' with ID ${adminId} successfully deleted.`,
      });
    } catch (error) {
      console.error("Error deleting admin:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "An error occurred while deleting the admin.",
      });
    }
  },
];


exports.logout = (req, res) => {
  // Check if a session exists
  if (req.session) {
    // Destroy the session
    req.session.destroy((err) => {
      if (err) {
        console.error("Error destroying session:", err);
        return res.status(500).json({
          error: "Internal Server Error: Unable to log out.",
        });
      }

      // Clear the session cookie
      res.clearCookie("connect.sid", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production", // Ensure secure cookie in production
        sameSite: "strict",
      });

      return res.status(200).json({
        message: "Logout successful!",
      });
    });
  } else {
    return res.status(400).json({
      error: "No active session found.",
    });
  }
};
