const db = require("../../db/connect");
const bcrypt = require("bcryptjs");
const notificationService = require("../../utils/notificationService");

const supplierIsLoggedIn = (req, res, next) => {
  if (req.session.supplier) {
    return next();
  }
  return res.status(401).json({ error: "Unauthorized: Please log in." });
};

// supplier Register
exports.registerSupplier = (req, res) => {
  const {
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
    password,
    about_us,
    bank,
    account_number,
    iban,
    swift_code,
  } = req.body;

  // Validate required fields
  if (
    !company_name.trim() ||
    !contact_person.trim() ||
    !address.trim() ||
    !postal_code.trim() ||
    !city.trim() ||
    !organization_number.trim() ||
    !started_year.trim() ||
    !phone.trim() ||
    !email.trim() ||
    !password.trim()
  ) {
    return res.status(400).json({ error: "All fields are required." });
  }

  // Check for duplicate email, phone, or organization number
  const checkQuery = `
      SELECT id FROM suppliers WHERE email = ? OR phone = ? OR organization_number = ?
    `;
  db.query(
    checkQuery,
    [email, phone, organization_number],
    (checkErr, checkResults) => {
      if (checkErr) {
        console.error("Error checking for duplicates:", checkErr);
        return res.status(500).json({ error: "Internal Server Error" });
      }

      if (checkResults.length > 0) {
        return res.status(409).json({
          error: "Email, phone number, or organization number already exists.",
        });
      }

      // Hash the password
      const saltRounds = 10;
      bcrypt.hash(password, saltRounds, (hashErr, hashedPassword) => {
        if (hashErr) {
          console.error("Error hashing password:", hashErr);
          return res
            .status(500)
            .json({ error: "Internal Server Error: Unable to hash password." });
        }

        // Insert supplier data
        const query = `
          INSERT INTO suppliers (
            company_name, contact_person, address, postal_code, city, organization_number,
            started_year, trucks, phone, email, password, about_us, bank, account_number, iban, swift_code
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const values = [
          company_name,
          contact_person,
          address,
          postal_code,
          city,
          organization_number,
          started_year,
          parseInt(trucks, 10) || 0, // Ensure trucks is an integer
          phone,
          email,
          hashedPassword,
          about_us || null,
          bank || null,
          account_number || null,
          iban || null,
          swift_code || null,
        ];

        db.query(query, values, (insertErr) => {
          if (insertErr) {
            console.error("Error inserting supplier data:", insertErr);
            return res
              .status(500)
              .json({ error: "Internal Server Error: Unable to insert data." });
          }

          return res
            .status(201)
            .json({ message: "Supplier registered successfully!" });
        });
      });
    }
  );
};

// supplier Login
exports.supplierLogin = (req, res) => {
  const { identifier, password } = req.body;

  // Validate input
  if (!identifier || !password) {
    return res.status(400).json({
      error: "Both identifier (email or phone) and password are required.",
    });
  }

  // Check if the supplier exists by email or phone
  const query = `
      SELECT id, email, phone, password, company_name 
      FROM suppliers 
      WHERE email = ? OR phone = ?
    `;
  db.query(query, [identifier, identifier], (err, results) => {
    if (err) {
      console.error("Error querying the database:", err);
      return res.status(500).json({
        error: "Internal Server Error: Unable to fetch supplier data.",
      });
    }

    // If no supplier is found
    if (results.length === 0) {
      return res.status(404).json({ error: "Supplier not found." });
    }

    // Validate the password
    const supplier = results[0];
    bcrypt.compare(password, supplier.password, (bcryptErr, isMatch) => {
      if (bcryptErr) {
        console.error("Error comparing passwords:", bcryptErr);
        return res.status(500).json({
          error: "Internal Server Error: Unable to validate password.",
        });
      }

      if (!isMatch) {
        return res
          .status(401)
          .json({ error: "Invalid email/phone or password." });
      }

      //  supplier info is saved in session
      req.session.supplier = {
        id: supplier.id,
        company_name: supplier.company_name,
        email: supplier.email,
        phone: supplier.phone,
      };

      // Successful login
      return res.status(200).json({
        message: "Login successful!",
        supplier: {
          company_name: supplier.company_name,
          email: supplier.email,
          phone: supplier.phone,
        },
      });
    });
  });
};

// getiing customer quottaions
exports.customerQuotations = [
  supplierIsLoggedIn,
  (req, res) => {
    // Define queries for the required fields from all tables
    const queries = {
      companyRelocation: `
          SELECT from_city, to_city, move_date, type_of_service FROM company_relocation
        `,
      moveOutCleaning: `
          SELECT from_city, to_city, move_date, type_of_service FROM move_out_cleaning
        `,
      storage: `
          SELECT from_city, to_city, move_date, type_of_service FROM storage
        `,
      heavyLifting: `
          SELECT from_city, to_city, move_date, type_of_service FROM heavy_lifting
        `,
      carryingAssistance: `
          SELECT from_city, to_city, move_date, type_of_service FROM carrying_assistance
        `,
      junkRemoval: `
          SELECT from_city, to_city, move_date, type_of_service FROM junk_removal
        `,
      estateClearance: `
          SELECT from_city, to_city, move_date, type_of_service FROM estate_clearance
        `,
      evacuationMove: `
          SELECT from_city, to_city, move_date, type_of_service FROM evacuation_move
        `,
      privacyMove: `
          SELECT from_city, to_city, move_date, type_of_service FROM privacy_move
        `,
    };

    // Execute all queries and collect results
    const results = {};
    const queryPromises = Object.entries(queries).map(([key, query]) => {
      return new Promise((resolve, reject) => {
        db.query(query, (err, rows) => {
          if (err) {
            console.error(`Error fetching data from ${key}:`, err);
            return reject(err);
          }
          results[key] = rows; // Store the result for each table
          resolve();
        });
      });
    });

    // Wait for all queries to complete
    Promise.all(queryPromises)
      .then(() => {
        return res.status(200).json({
          message: "Customer quotations fetched successfully!",
          data: results,
        });
      })
      .catch((err) => {
        console.error("Error fetching customer quotations:", err);
        return res
          .status(500)
          .json({ error: "Internal Server Error: Unable to fetch data." });
      });
  },
];

// sending a bid on a quotation
exports.sendBid = [
  supplierIsLoggedIn,
  (req, res) => {
    const { quotation_id, quotation_type, bid_price, additional_notes } = req.body;

    // Validate required fields
    if (!quotation_id || !quotation_type || !bid_price) {
      return res.status(400).json({
        error: "Quotation ID, quotation type, and bid price are required.",
      });
    }

    // Validate quotation type
    const allowedTypes = [
      "company_relocation",
      "move_out_cleaning",
      "storage",
      "heavy_lifting",
      "carrying_assistance",
      "junk_removal",
      "estate_clearance",
      "evacuation_move",
      "privacy_move",
      "local_move",
      "long_distance_move",
      "moving_abroad"
    ];

    if (!allowedTypes.includes(quotation_type)) {
      return res.status(400).json({ error: "Invalid quotation type provided." });
    }

    const supplier_id = req.session.supplier.id;

    if (!supplier_id) {
      return res.status(401).json({ error: "Unauthorized: Please log in as a supplier." });
    }

    // Determine which table to query based on quotation type
    const isMovingService = ["local_move", "long_distance_move", "moving_abroad"].includes(quotation_type);
    const tableName = isMovingService ? "moving_service" : quotation_type;

    // Modify the validation query for moving service types
    const validateQuotationQuery = isMovingService
      ? `
        SELECT id FROM ${tableName}
        WHERE id = ? 
        AND status = 'open'
        AND JSON_CONTAINS(type_of_service, ?)
      `
      : `
        SELECT id FROM ${tableName}
        WHERE id = ? AND status = 'open'
      `;

    // Prepare query parameters based on type
    const queryParams = isMovingService 
      ? [quotation_id, `"${quotation_type}"`]
      : [quotation_id];

    db.query(validateQuotationQuery, queryParams, (err, results) => {
      if (err) {
        console.error("Error validating quotation:", err);
        return res.status(500).json({ error: "Internal Server Error" });
      }

      if (results.length === 0) {
        return res.status(404).json({ 
          error: isMovingService 
            ? `Quotation not found, not open, or not of type ${quotation_type}.`
            : "Quotation not found or not open."
        });
      }

      // Ensure the quotation_type is properly escaped and handled as a string
      const insertBidQuery = `
        INSERT INTO bids (supplier_id, quotation_id, quotation_type, bid_price, additional_notes)
        VALUES (?, ?, ?, ?, ?)
      `;

      const bidParams = [
        supplier_id,
        quotation_id,
        quotation_type,  // Make sure quotation_type is being passed as a string
        bid_price,
        additional_notes || null,
      ];

      // Log the parameters for debugging
      console.log('Inserting bid with params:', bidParams);

      db.query(
        insertBidQuery,
        bidParams,
        async (insertErr, result) => {
          if (insertErr) {
            console.error("Error inserting bid data:", insertErr);
            return res.status(500).json({
              error: "Internal Server Error: Unable to submit bid.",
            });
          }

          try {
            // Notify admin about the new bid
            await notificationService.createNotification({
              recipientId: "admin",
              recipientType: "admin",
              title: "New Bid Submitted",
              message: `Supplier submitted a bid for ${quotation_type} (ID: ${quotation_id}).`,
              type: "new_bid",
            });
          } catch (notificationErr) {
            console.error("Error sending notification:", notificationErr);
          }

          // Respond with success message
          res.status(201).json({
            message: "Bid submitted successfully!",
            bidId: result.insertId,
          });
        }
      );
    });
  },
];

// viewing the quotation assocaited with the bid
exports.viewQuotationWithBid = (req, res) => {
  const { bid_id } = req.params;

  // Validate input
  if (!bid_id) {
    return res.status(400).json({ error: "Bid ID is required." });
  }

  // Step 1: Fetch the quotation_type and quotation_id from the bids table
  const getBidDetailsQuery = `
      SELECT quotation_type, quotation_id, bid_price, additional_notes, created_at AS bid_created_at
      FROM bids
      WHERE id = ?
    `;

  db.query(getBidDetailsQuery, [bid_id], (bidErr, bidResults) => {
    if (bidErr) {
      console.error("Error fetching bid details:", bidErr);
      return res
        .status(500)
        .json({ error: "Internal Server Error: Unable to fetch bid details." });
    }

    if (bidResults.length === 0) {
      return res.status(404).json({ error: "Bid not found." });
    }

    // Extract details from the bid
    const {
      quotation_type,
      quotation_id,
      bid_price,
      additional_notes,
      bid_created_at,
    } = bidResults[0];

    // Step 2: Fetch the quotation details from the relevant table
    const getQuotationDetailsQuery = `
        SELECT from_city, to_city, move_date, type_of_service
        FROM ${quotation_type}
        WHERE id = ?
      `;

    db.query(
      getQuotationDetailsQuery,
      [quotation_id],
      (quoteErr, quoteResults) => {
        if (quoteErr) {
          console.error(
            `Error fetching quotation from ${quotation_type}:`,
            quoteErr
          );
          return res.status(500).json({
            error: "Internal Server Error: Unable to fetch quotation details.",
          });
        }

        if (quoteResults.length === 0) {
          return res
            .status(404)
            .json({ error: "Quotation not found for the provided bid." });
        }

        // Combine bid and quotation data
        return res.status(200).json({
          message: "Quotation with linked bid retrieved successfully.",
          bid: {
            bid_id,
            bid_price,
            additional_notes,
            bid_created_at,
            quotation_type,
            quotation_id,
          },
          quotation: quoteResults[0], // Quotation details
        });
      }
    );
  });
};

//
exports.viewAllQuotationWithBid = (req, res) => {
  const { quotation_id, quotation_type } = req.params;

  // Validate input
  if (!quotation_id || !quotation_type) {
    return res
      .status(400)
      .json({ error: "Quotation ID and quotation type are required." });
  }

  // Validate quotation type against allowed types
  const allowedTypes = [
    "company_relocation",
    "move_out_cleaning",
    "storage",
    "heavy_lifting",
    "carrying_assistance",
    "junk_removal",
    "estate_clearance",
    "evacuation_move",
    "privacy_move",
  ];
  if (!allowedTypes.includes(quotation_type)) {
    return res.status(400).json({ error: "Invalid quotation type provided." });
  }

  // Step 1: Fetch the quotation details
  const getQuotationDetailsQuery = `
      SELECT from_city, to_city, move_date, type_of_service
      FROM ${quotation_type}
      WHERE id = ?
    `;

  db.query(
    getQuotationDetailsQuery,
    [quotation_id],
    (quoteErr, quoteResults) => {
      if (quoteErr) {
        console.error(
          `Error fetching quotation details from ${quotation_type}:`,
          quoteErr
        );
        return res.status(500).json({
          error: "Internal Server Error: Unable to fetch quotation details.",
        });
      }

      if (quoteResults.length === 0) {
        return res.status(404).json({ error: "Quotation not found." });
      }

      const quotationDetails = quoteResults[0];

      // Step 2: Fetch all bids linked to the quotation
      const getBidsQuery = `
        SELECT id AS bid_id, supplier_id, bid_price, additional_notes, created_at
        FROM bids
        WHERE quotation_id = ? AND quotation_type = ?
      `;

      db.query(
        getBidsQuery,
        [quotation_id, quotation_type],
        (bidsErr, bidsResults) => {
          if (bidsErr) {
            console.error("Error fetching bids:", bidsErr);
            return res
              .status(500)
              .json({ error: "Internal Server Error: Unable to fetch bids." });
          }

          // Combine quotation details with associated bids
          return res.status(200).json({
            message: "Quotation with all linked bids retrieved successfully.",
            quotation: quotationDetails,
            bids: bidsResults,
          });
        }
      );
    }
  );
};

// suppliers marketplace
exports.marketPlace = [
  supplierIsLoggedIn,
  (req, res) => {
    const { from_city, to_city, move_date, type_of_service } = req.query;

    let query = `
      SELECT 
        q.id AS quotation_id,
        q.table_name,
        q.from_city,
        q.to_city,
        q.move_date,
        q.type_of_service,
        q.created_at AS quotation_created_at,
        b.id AS bid_id,
        b.supplier_id,
        b.bid_price,
        b.total_price,
        b.additional_notes,
        b.created_at AS bid_created_at,
        b.status AS bid_status
      FROM (
        SELECT 
          'company_relocation' AS table_name, id, from_city, to_city, move_date, type_of_service, created_at 
          FROM company_relocation
        UNION ALL
        SELECT 
          'move_out_cleaning' AS table_name, id, from_city, to_city, move_date, type_of_service, created_at 
          FROM move_out_cleaning
        UNION ALL
        SELECT 
          'storage' AS table_name, id, from_city, to_city, move_date, type_of_service, created_at 
          FROM storage
        UNION ALL
        SELECT 
          'heavy_lifting' AS table_name, id, from_city, to_city, move_date, type_of_service, created_at 
          FROM heavy_lifting
        UNION ALL
        SELECT 
          'carrying_assistance' AS table_name, id, from_city, to_city, move_date, type_of_service, created_at 
          FROM carrying_assistance
        UNION ALL
        SELECT 
          'junk_removal' AS table_name, id, from_city, to_city, move_date, type_of_service, created_at 
          FROM junk_removal
        UNION ALL
        SELECT 
          'estate_clearance' AS table_name, id, from_city, to_city, move_date, type_of_service, created_at 
          FROM estate_clearance
        UNION ALL
        SELECT 
          'evacuation_move' AS table_name, id, from_city, to_city, move_date, type_of_service, created_at 
          FROM evacuation_move
        UNION ALL
        SELECT 
          'privacy_move' AS table_name, id, from_city, to_city, move_date, type_of_service, created_at 
          FROM privacy_move
        UNION ALL
        SELECT 
          'local_move' AS table_name,
          id,
          from_city,
          to_city,
          move_date,
          type_of_service,
          created_at
        FROM moving_service
        WHERE JSON_CONTAINS(type_of_service, '"local_move"')
        UNION ALL
        SELECT 
          'long_distance_move' AS table_name,
          id,
          from_city,
          to_city,
          move_date,
          type_of_service,
          created_at
        FROM moving_service
        WHERE JSON_CONTAINS(type_of_service, '"long_distance_move"')
        UNION ALL
        SELECT 
          'moving_abroad' AS table_name,
          id,
          from_city,
          to_city,
          move_date,
          type_of_service,
          created_at
        FROM moving_service
        WHERE JSON_CONTAINS(type_of_service, '"moving_abroad"')
      ) q
      LEFT JOIN bids b ON b.quotation_id = q.id AND b.quotation_type = q.table_name
    `;

    const filters = [];
    if (from_city) filters.push(`q.from_city LIKE '%${from_city}%'`);
    if (to_city) filters.push(`q.to_city LIKE '%${to_city}%'`);
    if (move_date) filters.push(`q.move_date = '${move_date}'`);
    if (type_of_service) filters.push(`q.type_of_service LIKE '%${type_of_service}%'`);

    if (filters.length > 0) {
      query += ` WHERE ${filters.join(" AND ")}`;
    }

    query += ` ORDER BY q.move_date DESC, q.created_at DESC`;

    db.query(query, (err, results) => {
      if (err) {
        console.error("Error fetching marketplace data:", err);
        return res.status(500).json({ error: "Internal Server Error" });
      }

      if (results.length === 0) {
        return res.status(404).json({
          message: "No quotations or bids found in the marketplace.",
        });
      }

      const marketplace = results.reduce((acc, item) => {
        const { quotation_id, table_name, ...quotationData } = item;

        if (!acc[`${table_name}_${quotation_id}`]) {
          acc[`${table_name}_${quotation_id}`] = {
            quotation: {
              id: quotation_id,
              table_name,
              from_city: quotationData.from_city,
              to_city: quotationData.to_city,
              move_date: quotationData.move_date,
              type_of_service: quotationData.type_of_service,
              created_at: quotationData.quotation_created_at,
            },
            bids: [],
          };
        }

        if (quotationData.bid_id) {
          acc[`${table_name}_${quotation_id}`].bids.push({
            bid_id: quotationData.bid_id,
            supplier_id: quotationData.supplier_id,
            bid_price: quotationData.bid_price,
            total_price: quotationData.total_price,
            additional_notes: quotationData.additional_notes,
            bid_created_at: quotationData.bid_created_at,
            bid_status: quotationData.bid_status,
          });
        }

        return acc;
      }, {});

      return res.status(200).json({
        message: "Marketplace data retrieved successfully.",
        marketplace: Object.values(marketplace),
      });
    });
  },
];



exports.getSupplierEarnings = [
  supplierIsLoggedIn,
  async (req, res) => {
    try {
      const supplierId = req.session.supplier.id;

      // Query to fetch earnings grouped by disbursement_status
      const earnings = await new Promise((resolve, reject) => {
        const query = `
          SELECT 
            disbursement_status,
            SUM(bid_price) AS total_earnings,
            COUNT(*) AS total_transactions
          FROM bids
          WHERE supplier_id = ?
          GROUP BY disbursement_status
        `;
        db.query(query, [supplierId], (err, results) => {
          if (err) reject(err);
          resolve(results);
        });
      });

      // Query to fetch monthly earnings
      const monthlyEarnings = await new Promise((resolve, reject) => {
        const query = `
          SELECT 
            DATE_FORMAT(created_at, '%Y-%m') AS month,
            SUM(bid_price) AS monthly_earnings
          FROM bids
          WHERE supplier_id = ?
          GROUP BY DATE_FORMAT(created_at, '%Y-%m')
          ORDER BY month DESC
        `;
        db.query(query, [supplierId], (err, results) => {
          if (err) reject(err);
          resolve(results);
        });
      });

      // Format the response
      const response = {
        totalEarnings: {
          pending: 0,
          completed: 0,
        },
        totalTransactions: {
          pending: 0,
          completed: 0,
        },
        monthlyEarnings,
      };

      earnings.forEach((entry) => {
        if (entry.disbursement_status === "pending") {
          response.totalEarnings.pending = entry.total_earnings;
          response.totalTransactions.pending = entry.total_transactions;
        } else if (entry.disbursement_status === "completed") {
          response.totalEarnings.completed = entry.total_earnings;
          response.totalTransactions.completed = entry.total_transactions;
        }
      });

      res.status(200).json({
        message: "Earnings fetched successfully.",
        data: response,
      });
    } catch (error) {
      console.error("Error fetching earnings:", error);
      res.status(500).json({ error: "Internal server error." });
    }
  },
];

// logging out
exports.supplierLogout = (req, res) => {
  // Check if supplier session exists
  if (req.session && req.session.supplier) {
    // Destroy the session
    req.session.destroy((err) => {
      if (err) {
        console.error("Error destroying supplier session:", err);
        return res.status(500).json({
          error: "Internal Server Error: Unable to log out supplier.",
        });
      }

      // Clear supplier cookies
      res.clearCookie("connect.sid", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: '/'
      });

      res.clearCookie("supplier_token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: '/'
      });

      return res.status(200).json({
        message: "Supplier logout successful!",
      });
    });
  } else {
    return res.status(401).json({
      error: "No active supplier session found.",
    });
  }
};