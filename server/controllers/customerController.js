const db = require("../../db/connect");
const bcrypt = require("bcryptjs");
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const emailService = require("../../utils/emailService");
const notificationService = require("../../utils/notificationService");

const userIsLoggedIn = (req, res, next) => {
  if (req.session && req.session.user) {
    // User is logged in, proceed to the next middleware or route
    return next();
  } else {
    // User is not logged in, redirect or respond with an error
    return res.status(401).json({ error: "Unauthorized. Please log in." });
  }
};

exports.dashboard = [
  userIsLoggedIn,
  async (req, res) => {
    const userEmail = req.session.user.email;

    try {
      // Queries for fetching user's quotations from all tables
      const quotationQueries = {
        companyRelocation: `
          SELECT id, from_city, to_city, move_date, type_of_service
          FROM company_relocation
          WHERE email_address = ?
        `,
        moveOutCleaning: `
          SELECT id, from_city, to_city, move_date, type_of_service
          FROM move_out_cleaning
          WHERE email_address = ?
        `,
        storage: `
          SELECT id, from_city, to_city, move_date, type_of_service
          FROM storage
          WHERE email_address = ?
        `,
        heavyLifting: `
          SELECT id, from_city, to_city, move_date, type_of_service
          FROM heavy_lifting
          WHERE email_address = ?
        `,
        carryingAssistance: `
          SELECT id, from_city, to_city, move_date, type_of_service
          FROM carrying_assistance
          WHERE email_address = ?
        `,
        junkRemoval: `
          SELECT id, from_city, to_city, move_date, type_of_service
          FROM junk_removal
          WHERE email_address = ?
        `,
        estateClearance: `
          SELECT id, from_city, to_city, move_date, type_of_service
          FROM estate_clearance
          WHERE email_address = ?
        `,
        evacuationMove: `
          SELECT id, from_city, to_city, move_date, type_of_service
          FROM evacuation_move
          WHERE email_address = ?
        `,
        privacyMove: `
          SELECT id, from_city, to_city, move_date, type_of_service
          FROM privacy_move
          WHERE email_address = ?
        `,
      };

      // Execute all quotation queries using Promise
      const quotationResults = {};
      const queryPromises = Object.entries(quotationQueries).map(
        ([key, query]) => {
          return new Promise((resolve, reject) => {
            db.query(query, [userEmail], (err, rows) => {
              if (err) reject(err);
              quotationResults[key] = rows;
              resolve();
            });
          });
        }
      );

      await Promise.all(queryPromises);

      // Fetch total count of quotations
      const totalQuotations = Object.values(quotationResults).reduce(
        (count, rows) => count + rows.length,
        0
      );

      // Fetch approved bids for the user
      const approvedBidsQuery = `
        SELECT 
          b.id AS bid_id, 
          b.total_price, 
          b.status,
          b.quotation_type,
          q.from_city,
          q.to_city,
          q.move_date,
          q.type_of_service
        FROM bids b
        JOIN (
          SELECT 'company_relocation' AS table_name, id, email_address, from_city, to_city, move_date, type_of_service FROM company_relocation
          UNION ALL
          SELECT 'move_out_cleaning', id, email_address, from_city, to_city, move_date, type_of_service FROM move_out_cleaning
          UNION ALL
          SELECT 'storage', id, email_address, from_city, to_city, move_date, type_of_service FROM storage
          UNION ALL
          SELECT 'heavy_lifting', id, email_address, from_city, to_city, move_date, type_of_service FROM heavy_lifting
          UNION ALL
          SELECT 'carrying_assistance', id, email_address, from_city, to_city, move_date, type_of_service FROM carrying_assistance
          UNION ALL
          SELECT 'junk_removal', id, email_address, from_city, to_city, move_date, type_of_service FROM junk_removal
          UNION ALL
          SELECT 'estate_clearance', id, email_address, from_city, to_city, move_date, type_of_service FROM estate_clearance
          UNION ALL
          SELECT 'evacuation_move', id, email_address, from_city, to_city, move_date, type_of_service FROM evacuation_move
          UNION ALL
          SELECT 'privacy_move', id, email_address, from_city, to_city, move_date, type_of_service FROM privacy_move
        ) q ON b.quotation_id = q.id AND b.quotation_type = q.table_name
        WHERE b.status = 'approved' AND q.email_address = ?
      `;

      const approvedBids = await new Promise((resolve, reject) => {
        db.query(approvedBidsQuery, [userEmail], (err, results) => {
          if (err) reject(err);
          resolve(results);
        });
      });

      // Total count of approved bids
      const totalApprovedBids = approvedBids.length;

      // Respond with user dashboard data
      res.status(200).json({
        message: "Welcome to your dashboard!",
        user: req.session.user,
        totalQuotations,
        totalApprovedBids,
        quotations: quotationResults,
        approvedBids,
      });
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      res.status(500).json({
        error: "Internal Server Error: Unable to fetch dashboard data.",
      });
    }
  },
];

exports.getCustomerData = [
  userIsLoggedIn,
  async (req, res) => {
    const userEmail = req.session.user.email;

    try {
      // Queries for fetching customer's quotations from all tables
      const quotationQueries = {
        companyRelocation: `
          SELECT id, from_city, to_city, move_date, type_of_service
          FROM company_relocation
          WHERE email_address = ?
        `,
        moveOutCleaning: `
          SELECT id, from_city, to_city, move_date, type_of_service
          FROM move_out_cleaning
          WHERE email_address = ?
        `,
        storage: `
          SELECT id, from_city, to_city, move_date, type_of_service
          FROM storage
          WHERE email_address = ?
        `,
        heavyLifting: `
          SELECT id, from_city, to_city, move_date, type_of_service
          FROM heavy_lifting
          WHERE email_address = ?
        `,
        carryingAssistance: `
          SELECT id, from_city, to_city, move_date, type_of_service
          FROM carrying_assistance
          WHERE email_address = ?
        `,
        junkRemoval: `
          SELECT id, from_city, to_city, move_date, type_of_service
          FROM junk_removal
          WHERE email_address = ?
        `,
        estateClearance: `
          SELECT id, from_city, to_city, move_date, type_of_service
          FROM estate_clearance
          WHERE email_address = ?
        `,
        evacuationMove: `
          SELECT id, from_city, to_city, move_date, type_of_service
          FROM evacuation_move
          WHERE email_address = ?
        `,
        privacyMove: `
          SELECT id, from_city, to_city, move_date, type_of_service
          FROM privacy_move
          WHERE email_address = ?
        `,
        movingService: `
          SELECT id, from_city, to_city, move_date, type_of_service
          FROM moving_service
          WHERE email_address = ?
        `,
      };

      // Execute all quotation queries
      const quotationResults = {};
      const queryPromises = Object.entries(quotationQueries).map(
        ([key, query]) => {
          return new Promise((resolve, reject) => {
            db.query(query, [userEmail], (err, rows) => {
              if (err) reject(err);
              quotationResults[key] = rows;
              resolve();
            });
          });
        }
      );

      await Promise.all(queryPromises);

      // Fetch total count of quotations
      const totalQuotations = Object.values(quotationResults).reduce(
        (count, rows) => count + rows.length,
        0
      );

      // Fetch customer's bids
      const bidsQuery = `
        SELECT 
          b.id AS bid_id, 
          b.total_price, 
          b.status,
          b.quotation_type,
          q.from_city,
          q.to_city,
          q.move_date,
          q.type_of_service
        FROM bids b
        JOIN (
          SELECT 'company_relocation' AS table_name, id, email_address, from_city, to_city, move_date, type_of_service FROM company_relocation
          UNION ALL
          SELECT 'move_out_cleaning', id, email_address, from_city, to_city, move_date, type_of_service FROM move_out_cleaning
          UNION ALL
          SELECT 'storage', id, email_address, from_city, to_city, move_date, type_of_service FROM storage
          UNION ALL
          SELECT 'heavy_lifting', id, email_address, from_city, to_city, move_date, type_of_service FROM heavy_lifting
          UNION ALL
          SELECT 'carrying_assistance', id, email_address, from_city, to_city, move_date, type_of_service FROM carrying_assistance
          UNION ALL
          SELECT 'junk_removal', id, email_address, from_city, to_city, move_date, type_of_service FROM junk_removal
          UNION ALL
          SELECT 'estate_clearance', id, email_address, from_city, to_city, move_date, type_of_service FROM estate_clearance
          UNION ALL
          SELECT 'evacuation_move', id, email_address, from_city, to_city, move_date, type_of_service FROM evacuation_move
          UNION ALL
          SELECT 'privacy_move', id, email_address, from_city, to_city, move_date, type_of_service FROM privacy_move
          UNION ALL
          SELECT 'moving_service', id, email_address, from_city, to_city, move_date, type_of_service FROM moving_service
        ) q ON b.quotation_id = q.id AND b.quotation_type = q.table_name
        WHERE q.email_address = ?
      `;

      const bids = await new Promise((resolve, reject) => {
        db.query(bidsQuery, [userEmail], (err, results) => {
          if (err) reject(err);
          resolve(results);
        });
      });

      // Total counts for bids and conversations
      const totalBids = bids.length;

      // Respond with data
      res.status(200).json({
        message: "Customer data fetched successfully.",
        user: req.session.user,
        totalQuotations,
        totalBids,
        quotations: quotationResults,
        bids,
      });
    } catch (error) {
      console.error("Error fetching customer data:", error);
      res.status(500).json({
        error: "Internal Server Error: Unable to fetch customer data.",
      });
    }
  },
];

// user register
exports.register = (req, res) => {
  const { password, fullname, email, phone_number, gender } = req.body;

  // Check if any required field is missing
  if (!password || !fullname || !email || !phone_number || !gender) {
    return res.status(400).json({ error: "All fields are required." });
  }

  // Check if the email or phone number already exists
  const checkQuery = `
        SELECT email, phone_num FROM customers 
        WHERE email = ? OR phone_num = ?
      `;
  db.query(checkQuery, [email, phone_number], (checkError, checkResults) => {
    if (checkError) {
      console.error("Error checking for existing user:", checkError);
      return res
        .status(500)
        .json({ error: "Internal Server Error: Unable to check user." });
    }

    // If results are returned, either the email or phone number already exists
    if (checkResults.length > 0) {
      const existingFields = checkResults
        .map((row) =>
          row.email === email
            ? "email"
            : row.phone_num === phone_number
            ? "phone number"
            : null
        )
        .filter(Boolean)
        .join(" and ");
      return res.status(409).json({
        error: `${existingFields} already exists. Please use a different ${existingFields}.`,
      });
    }

    // Hash the password before saving to the database
    const saltRounds = 10;
    bcrypt.hash(password, saltRounds, (hashError, hashedPassword) => {
      if (hashError) {
        console.error("Error hashing password:", hashError);
        return res
          .status(500)
          .json({ error: "Internal Server Error: Unable to hash password." });
      }

      // Prepare SQL query to insert new user
      const query = `
            INSERT INTO customers (password, fullname, email, phone_num, gender)
            VALUES (?, ?, ?, ?)
          `;

      const values = [hashedPassword, fullname, email, phone_number, gender];

      // Execute query
      db.query(query, values, (insertError, results) => {
        if (insertError) {
          console.error("Database error:", insertError);
          return res
            .status(500)
            .json({ error: "Internal Server Error: Unable to insert data." });
        }

        // Success response
        return res.status(201).json({ message: "Registration successful!" });
      });
    });
  });
};

// user login
exports.login = (req, res) => {
  const { identifier, password } = req.body;

  // Validate input
  if (!identifier || !password) {
    return res
      .status(400)
      .json({ error: "Both identifier and password are required." });
  }

  // Check if the user exists by email or phone number
  const query = `
      SELECT id, email, phone_num, password, fullname 
      FROM customers 
      WHERE email = ? OR phone_num = ?
    `;
  db.query(query, [identifier, identifier], (err, results) => {
    if (err) {
      console.error("Error querying the database:", err);
      return res
        .status(500)
        .json({ error: "Internal Server Error: Unable to fetch user data." });
    }

    // If no user is found
    if (results.length === 0) {
      return res
        .status(404)
        .json({ error: "Invalid email/phone number or password." });
    }

    // Validate the password
    const user = results[0];
    bcrypt.compare(password, user.password, (bcryptErr, isMatch) => {
      if (bcryptErr) {
        console.error("Error comparing passwords:", bcryptErr);
        return res.status(500).json({
          error: "Internal Server Error: Unable to validate password.",
        });
      }

      if (!isMatch) {
        return res
          .status(401)
          .json({ error: "Invalid email/phone number or password." });
      }

      // Save user info in the session
      req.session.user = {
        id: user.id,
        fullname: user.fullname,
        email: user.email,
        phone_number: user.phone_num,
      };

      // Successful login
      return res.status(200).json({
        message: "Login successful!",
        user: {
          fullname: user.fullname,
          email: user.email,
          phone_number: user.phone_num,
        },
      });
    });
  });
};

// user update information
exports.customerUpdateInfo = (req, res) => {
  const { email, fullname, password, phone_number } = req.body;

  // Validate input
  if (!email || (!fullname && !password && !phone_number)) {
    return res
      .status(400)
      .json({ error: "Email and at least one field to update are required." });
  }

  // Fields to update
  const updates = [];
  const values = [];

  if (fullname) {
    updates.push("fullname = ?");
    values.push(fullname);
  }

  if (password) {
    const saltRounds = 10;
    return bcrypt.hash(password, saltRounds, async (err, hashedPassword) => {
      if (err) {
        console.error("Error hashing password:", err);
        return res
          .status(500)
          .json({ error: "Internal Server Error: Unable to hash password." });
      }

      updates.push("password = ?");
      values.push(hashedPassword);

      if (phone_number) {
        updates.push("phone_num = ?");
        values.push(phone_number);
      }

      // Email as the condition
      values.push(email);

      const query = `
        UPDATE customers
        SET ${updates.join(", ")}
        WHERE email = ?
      `;

      db.query(query, values, async (dbErr, result) => {
        if (dbErr) {
          console.error("Error updating customer info:", dbErr);
          return res.status(500).json({
            error: "Internal Server Error: Unable to update customer info.",
          });
        }

        if (result.affectedRows === 0) {
          return res.status(404).json({ error: "Customer not found." });
        }

        // Notification for profile update
        try {
          await notificationService.createNotification({
            recipientId: email,
            recipientType: "customer",
            title: "Profile Updated",
            message: "Your profile information has been successfully updated.",
            type: "profile_update",
          });
        } catch (error) {
          console.error("Error creating notification:", error);
        }

        return res.status(200).json({
          message: "Customer information updated successfully!",
        });
      });
    });
  }

  // If password is not included
  if (phone_number) {
    updates.push("phone_num = ?");
    values.push(phone_number);
  }

  // Add email as the condition
  values.push(email);

  const query = `
    UPDATE customers
    SET ${updates.join(", ")}
    WHERE email = ?
  `;

  db.query(query, values, async (dbErr, result) => {
    if (dbErr) {
      console.error("Error updating customer info:", dbErr);
      return res.status(500).json({
        error: "Internal Server Error: Unable to update customer info.",
      });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Customer not found." });
    }

    // Notification for profile update
    try {
      await notificationService.createNotification({
        recipientId: email,
        recipientType: "customer",
        title: "Profile Updated",
        message: "Your profile information has been successfully updated.",
        type: "profile_update",
      });
    } catch (error) {
      console.error("Error creating notification:", error);
    }

    return res.status(200).json({
      message: "Customer information updated successfully!",
    });
  });
};

// stripe payment
exports.customerPayment = async (req, res) => {
  try {
    const { bid_id, customer_email, payment_method_id } = req.body;

    // Validate required fields
    if (!bid_id || !customer_email || !payment_method_id) {
      return res.status(400).json({
        error: "Bid ID, customer email, and payment method ID are required.",
      });
    }

    const getBidQuery = `
      SELECT 
        b.id AS bid_id, 
        b.bid_price, 
        b.total_price, 
        b.payment_status,
        b.payment_method,
        b.requires_payment_method,
        b.quotation_type,
        b.quotation_id,
        s.company_name AS supplier_name, 
        s.email AS supplier_email,
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
        END AS quotation_customer_email
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

    const [bid] = await new Promise((resolve, reject) => {
      db.query(getBidQuery, [bid_id], (err, results) => {
        if (err) reject(err);
        resolve(results);
      });
    });

    if (!bid) {
      return res.status(404).json({ error: "Bid not found." });
    }

    if (bid.payment_status.trim().toLowerCase() !== "pending") {
      return res
        .status(400)
        .json({ error: "Payment already completed or in process." });
    }

    if (
      customer_email.toLowerCase() !==
      bid.quotation_customer_email.toLowerCase()
    ) {
      return res.status(403).json({
        error: "Unauthorized: Email does not match quotation customer.",
      });
    }

    const amountInOre = Math.round(bid.total_price * 100);

    if (amountInOre < 50) {
      return res
        .status(400)
        .json({ error: "Amount must be at least 0.50 SEK." });
    }

    // Create Stripe Payment Intent with attached payment method
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInOre,
      currency: "sek",
      payment_method: payment_method_id, // Attach payment method ID
      confirm: true, // Automatically confirm the payment
      description: `Payment for ${bid.quotation_type} bid #${bid.bid_id}`,
      receipt_email: bid.quotation_customer_email,
      metadata: {
        bid_id: bid.bid_id,
        quotation_type: bid.quotation_type,
        supplier_email: bid.supplier_email,
      },
    });

    // Update database with payment information
    const updatePaymentQuery = `
      UPDATE bids 
      SET 
        payment_intent_id = ?, 
        payment_status = 'in_escrow',
        escrow_release_date = DATE_ADD(NOW(), INTERVAL 5 DAY),
        payment_method = 'debit_card',
        requires_payment_method = false
      WHERE id = ?
    `;

    await new Promise((resolve, reject) => {
      db.query(updatePaymentQuery, [paymentIntent.id, bid_id], (err) =>
        err ? reject(err) : resolve()
      );
    });

    // Notify customer and supplier
    await emailService.sendEmail(
      bid.quotation_customer_email,
      emailService.templates.paymentInitiated({
        bidId: bid.bid_id,
        customerName: "Valued Customer",
        amount: `${bid.total_price} SEK`,
        supplierName: bid.supplier_name,
        quotationType: bid.quotation_type
          .replace(/_/g, " ")
          .replace(/\b\w/g, (l) => l.toUpperCase()),
        escrowReleaseDate: new Date(
          Date.now() + 5 * 24 * 60 * 60 * 1000
        ).toLocaleDateString(),
      })
    );

    await emailService.sendEmail(
      bid.supplier_email,
      emailService.templates.paymentInitiatedSupplier({
        bidId: bid.bid_id,
        customerName: "Customer",
        amount: `${bid.bid_price} SEK`,
        quotationType: bid.quotation_type
          .replace(/_/g, " ")
          .replace(/\b\w/g, (l) => l.toUpperCase()),
        escrowReleaseDate: new Date(
          Date.now() + 5 * 24 * 60 * 60 * 1000
        ).toLocaleDateString(),
      })
    );

    return res.status(200).json({
      message: "Payment successful.",
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
      amount: amountInOre / 100,
    });
  } catch (error) {
    console.error("Error processing payment:", error);

    if (error.type === "StripeCardError") {
      return res
        .status(400)
        .json({ error: "Payment failed. Please try again." });
    }

    return res.status(500).json({ error: "Internal Server Error." });
  }
};

exports.orderDetails = [
  userIsLoggedIn,
  async (req, res) => {
    const { orderId } = req.params;
    const userEmail = req.session.user.email;

    try {
      if (!orderId || !orderId.includes("-")) {
        return res.status(400).json({ error: "Invalid order ID format" });
      }

      const [quotationType, quotationId, bidId] = orderId.split("-");

      const query = `
        SELECT 
          CONCAT(b.quotation_type, '-', b.quotation_id, '-', b.id) AS order_number,
          s.company_name AS mover_name,
          s.phone AS mover_contact,
          s.email AS mover_email,
          b.payment_method,
          b.total_price AS amount_paid,
          b.escrow_release_date,
          CASE 
            WHEN b.escrow_release_date > NOW() THEN 'pending'
            ELSE 'completed'
          END AS escrow_service,
          b.status AS order_status,
          b.payment_status,
          b.created_at,
          q.from_city,
          q.to_city AS delivery_address,
          q.type_of_service,
          q.move_date,
          CASE q.table_name
            WHEN 'carrying_assistance' THEN q.type_of_items_to_carry
            WHEN 'company_relocation' THEN q.list_of_larger_items
            WHEN 'estate_clearance' THEN q.type_of_items_to_clear
            WHEN 'evacuation_move' THEN q.evacuation_reason
            WHEN 'heavy_lifting' THEN q.type_of_items
            WHEN 'junk_removal' THEN q.type_of_junk
            WHEN 'move_out_cleaning' THEN q.specific_cleaning_requests
            WHEN 'privacy_move' THEN q.specific_requirements
            WHEN 'storage' THEN q.type_of_items_to_store
          END AS items,
          q.table_name AS service_type
        FROM bids b
        JOIN suppliers s ON b.supplier_id = s.id
        JOIN (
          SELECT 
            id, email_address, from_city, to_city, type_of_service, move_date,
            type_of_items_to_carry,
            NULL as list_of_larger_items,
            NULL as type_of_items_to_clear,
            NULL as evacuation_reason,
            NULL as type_of_items,
            NULL as type_of_junk,
            NULL as specific_cleaning_requests,
            NULL as specific_requirements,
            NULL as type_of_items_to_store,
            'carrying_assistance' AS table_name
          FROM carrying_assistance WHERE email_address = ?
          
          UNION ALL
          
          SELECT 
            id, email_address, from_city, to_city, type_of_service, move_date,
            NULL as type_of_items_to_carry,
            list_of_larger_items,
            NULL as type_of_items_to_clear,
            NULL as evacuation_reason,
            NULL as type_of_items,
            NULL as type_of_junk,
            NULL as specific_cleaning_requests,
            NULL as specific_requirements,
            NULL as type_of_items_to_store,
            'company_relocation' AS table_name
          FROM company_relocation WHERE email_address = ?
          
          UNION ALL
          
          SELECT 
            id, email_address, from_city, to_city, type_of_service, move_date,
            NULL as type_of_items_to_carry,
            NULL as list_of_larger_items,
            type_of_items_to_clear,
            NULL as evacuation_reason,
            NULL as type_of_items,
            NULL as type_of_junk,
            NULL as specific_cleaning_requests,
            NULL as specific_requirements,
            NULL as type_of_items_to_store,
            'estate_clearance' AS table_name
          FROM estate_clearance WHERE email_address = ?
          
          UNION ALL
          
          SELECT 
            id, email_address, from_city, to_city, type_of_service, move_date,
            NULL as type_of_items_to_carry,
            NULL as list_of_larger_items,
            NULL as type_of_items_to_clear,
            evacuation_reason,
            NULL as type_of_items,
            NULL as type_of_junk,
            NULL as specific_cleaning_requests,
            NULL as specific_requirements,
            NULL as type_of_items_to_store,
            'evacuation_move' AS table_name
          FROM evacuation_move WHERE email_address = ?
          
          UNION ALL
          
          SELECT 
            id, email_address, from_city, to_city, type_of_service, move_date,
            NULL as type_of_items_to_carry,
            NULL as list_of_larger_items,
            NULL as type_of_items_to_clear,
            NULL as evacuation_reason,
            type_of_items,
            NULL as type_of_junk,
            NULL as specific_cleaning_requests,
            NULL as specific_requirements,
            NULL as type_of_items_to_store,
            'heavy_lifting' AS table_name
          FROM heavy_lifting WHERE email_address = ?
          
          UNION ALL
          
          SELECT 
            id, email_address, from_city, to_city, type_of_service, move_date,
            NULL as type_of_items_to_carry,
            NULL as list_of_larger_items,
            NULL as type_of_items_to_clear,
            NULL as evacuation_reason,
            NULL as type_of_items,
            type_of_junk,
            NULL as specific_cleaning_requests,
            NULL as specific_requirements,
            NULL as type_of_items_to_store,
            'junk_removal' AS table_name
          FROM junk_removal WHERE email_address = ?
          
          UNION ALL
          
          SELECT 
            id, email_address, from_city, to_city, type_of_service, move_date,
            NULL as type_of_items_to_carry,
            NULL as list_of_larger_items,
            NULL as type_of_items_to_clear,
            NULL as evacuation_reason,
            NULL as type_of_items,
            NULL as type_of_junk,
            specific_cleaning_requests,
            NULL as specific_requirements,
            NULL as type_of_items_to_store,
            'move_out_cleaning' AS table_name
          FROM move_out_cleaning WHERE email_address = ?
          
          UNION ALL
          
          SELECT 
            id, email_address, from_city, to_city, type_of_service, move_date,
            NULL as type_of_items_to_carry,
            NULL as list_of_larger_items,
            NULL as type_of_items_to_clear,
            NULL as evacuation_reason,
            NULL as type_of_items,
            NULL as type_of_junk,
            NULL as specific_cleaning_requests,
            specific_requirements,
            NULL as type_of_items_to_store,
            'privacy_move' AS table_name
          FROM privacy_move WHERE email_address = ?
          
          UNION ALL
          
          SELECT 
            id, email_address, from_city, to_city, type_of_service, move_date,
            NULL as type_of_items_to_carry,
            NULL as list_of_larger_items,
            NULL as type_of_items_to_clear,
            NULL as evacuation_reason,
            NULL as type_of_items,
            NULL as type_of_junk,
            NULL as specific_cleaning_requests,
            NULL as specific_requirements,
            type_of_items_to_store,
            'storage' AS table_name
          FROM storage WHERE email_address = ?
        ) q ON b.quotation_id = q.id AND b.quotation_type = q.table_name
        WHERE b.id = ? 
        AND b.quotation_type = ?
        AND b.quotation_id = ?
        LIMIT 1
      `;

      const params = [
        ...Array(9).fill(userEmail),
        bidId,
        quotationType,
        quotationId,
      ];

      const order = await new Promise((resolve, reject) => {
        db.query(query, params, (err, results) => {
          if (err) {
            console.error("Query error:", err);
            return reject(err);
          }
          resolve(results && results.length ? results[0] : null);
        });
      });

      if (!order) {
        return res.status(404).json({
          error: "Order not found or you don't have permission to view it",
        });
      }

      res.status(200).json({
        message: "Order details fetched successfully",
        data: {
          ...order,
          items: order.items || null,
          created_at: new Date(order.created_at).toISOString(),
          move_date: order.move_date
            ? new Date(order.move_date).toISOString()
            : null,
          escrow_release_date: order.escrow_release_date
            ? new Date(order.escrow_release_date).toISOString()
            : null,
        },
      });
    } catch (error) {
      console.error("Error fetching order details:", error);
      res.status(500).json({
        error: "Internal Server Error: Unable to fetch order details",
      });
    }
  },
];

exports.fileComplaint = [
  userIsLoggedIn,
  (req, res) => {
    const { quotation_id, quotation_type, category, description, photo_url } =
      req.body;
    const customer_email = req.session.user.email;
    const customer_id = req.session.user.id;

    if (!quotation_id || !quotation_type || !category || !description) {
      return res.status(400).json({
        error:
          "Quotation ID, quotation type, category, and description are required.",
      });
    }

    const regularTypes = [
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

    const movingServiceTypes = [
      "local_move",
      "long_distance_move",
      "moving_abroad",
    ];

    const allowedTypes = [...regularTypes, ...movingServiceTypes];

    if (!allowedTypes.includes(quotation_type)) {
      return res
        .status(400)
        .json({ error: "Invalid quotation type provided." });
    }

    // Different validation queries for regular and moving services
    const validateQuotationQuery = movingServiceTypes.includes(quotation_type)
      ? `
        SELECT email_address 
        FROM moving_service 
        WHERE id = ? 
        AND email_address = ?
        AND JSON_CONTAINS(type_of_service, '"${quotation_type}"', '$')
      `
      : `
        SELECT email_address 
        FROM ${quotation_type} 
        WHERE id = ?
        AND email_address = ?
      `;

    db.query(
      validateQuotationQuery,
      [quotation_id, customer_email],
      (err, results) => {
        if (err) {
          console.error("Error validating quotation:", err);
          return res.status(500).json({ error: "Internal Server Error." });
        }

        if (results.length === 0) {
          return res.status(404).json({
            error: "No matching quotation found for the provided ID and email.",
          });
        }

        const insertComplaintQuery = `
        INSERT INTO complaints (
          customer_id, quotation_id, quotation_type, category, description, photo_url
        ) VALUES (?, ?, ?, ?, ?, ?)
      `;

        db.query(
          insertComplaintQuery,
          [
            customer_id,
            quotation_id,
            quotation_type,
            category,
            description,
            photo_url || null,
          ],
          (insertErr, result) => {
            if (insertErr) {
              console.error("Error creating complaint:", insertErr);
              return res.status(500).json({ error: "Internal Server Error." });
            }

            res.status(201).json({
              message: "Complaint submitted successfully.",
              complaintId: result.insertId,
            });
          }
        );
      }
    );
  },
];

exports.getCustomerComplaints = [
  userIsLoggedIn,
  async (req, res) => {
    const customerId = req.session.user.id;

    try {
      const query = `
        SELECT id, quotation_id, category, description, photo_url, status, created_at, resolved_at
        FROM complaints
        WHERE customer_id = ?
        ORDER BY created_at DESC
      `;

      const complaints = await new Promise((resolve, reject) => {
        db.query(query, [customerId], (err, results) => {
          if (err) return reject(err);
          resolve(results);
        });
      });

      return res.status(200).json({ complaints });
    } catch (error) {
      console.error("Error fetching complaints:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  },
];

exports.userLogout = (req, res) => {
  // Check if user session exists
  if (req.session && req.session.user) {
    // Destroy the session
    req.session.destroy((err) => {
      if (err) {
        console.error("Error destroying user session:", err);
        return res.status(500).json({
          error: "Internal Server Error: Unable to log out user.",
        });
      }

      // Clear user cookies
      res.clearCookie("connect.sid", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
      });

      res.clearCookie("user_token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
      });

      return res.status(200).json({
        message: "User logout successful!",
      });
    });
  } else {
    return res.status(401).json({
      error: "No active user session found.",
    });
  }
};

exports.getNotifications = [
  userIsLoggedIn,
  async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;

      const userId = req.session.user.id; // Ensure this is correct
      const userType = req.session.user.type || "customer"; // Get user type from session

      console.log("Fetching notifications for:", { userId, userType });

      const notifications = await notificationService.getUserNotifications(
        userId,
        userType,
        page,
        limit
      );

      if (!notifications.length) {
        console.log("No notifications found for user:", { userId, userType });
      }

      res.status(200).json({
        message: "Notifications fetched successfully.",
        notifications,
      });
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  },
];

exports.markNotificationRead = [
  userIsLoggedIn,
  async (req, res) => {
    try {
      const { notificationId } = req.params;

      await notificationService.markAsRead(notificationId, req.session.user.id);

      res.status(200).json({ message: "Notification marked as read" });
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  },
];
