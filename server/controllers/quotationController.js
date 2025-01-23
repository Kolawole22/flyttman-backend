const db = require("../../db/connect");
const bcrypt = require("bcryptjs");

const sendErrorResponse = (res, statusCode, message) => {
  console.error(message);
  return res.status(statusCode).json({ error: message });
};

const adminIsLoggedIn = (req, res, next) => {
  if (req.session && req.session.admin) {
    return next();
  } else {
    return res.status(401).json({ error: "Unauthorized. Only admins can use this." });
  }
};

const validateBaseFields = (req) => {
  const { from_city, to_city, move_date, type_of_service, email_address, phone_number } = req.body;
  if (!from_city || !to_city || !move_date || !type_of_service || !email_address || !phone_number) {
    return { isValid: false, error: "Missing required fields." };
  }
  return { isValid: true };
};

const checkAndCreateCustomer = (email, phone, res, callback) => {
  const checkCustomerQuery = `SELECT id FROM customers WHERE email = ? OR phone_num = ?`;
  db.query(checkCustomerQuery, [email, phone], (checkErr, checkResults) => {
    if (checkErr) {
      return sendErrorResponse(res, 500, "Internal Server Error");
    }
    if (checkResults.length > 0) {
      return callback(false);
    }
    const saltRounds = 10;
    bcrypt.hash(phone, saltRounds, (hashErr, hashedPassword) => {
      if (hashErr) {
        return sendErrorResponse(res, 500, "Internal Server Error");
      }
      const createCustomerQuery = `INSERT INTO customers (email, password, phone_num) VALUES (?, ?, ?)`;
      db.query(createCustomerQuery, [email, hashedPassword, phone], (createErr) => {
        if (createErr) {
          return sendErrorResponse(res, 500, "Internal Server Error");
        }
        return callback(true);
      });
    });
  });
};

const handleQuotation = (req, res, tableName, additionalFields = [], additionalValues = []) => {
  const { from_city, to_city, move_date, type_of_service, email_address, phone_number } = req.body;

  // Validate required fields
  const validation = validateBaseFields(req);
  if (!validation.isValid) {
    return res.status(400).json({ error: validation.error });
  }

  // Ensure additionalFields and additionalValues arrays are of the same length
  if (additionalFields.length !== additionalValues.length) {
    console.error("Mismatch between additional fields and values");
    return res.status(500).json({ error: "Internal Server Error: Field mismatch." });
  }

  // Build query dynamically with placeholders for additional fields and values
  const query = `
    INSERT INTO ${tableName} (
      from_city, to_city, move_date, type_of_service, email_address, phone_number
      ${additionalFields.length > 0 ? `, ${additionalFields.join(", ")}` : ""}
    ) VALUES (?, ?, ?, ?, ?, ?
      ${additionalValues.length > 0 ? `, ${additionalValues.map(() => "?").join(", ")}` : ""}
    )
  `;

  const values = [
    from_city, to_city, move_date, JSON.stringify(type_of_service), email_address, phone_number, ...additionalValues,
  ];

  console.log("Executing query:", query);
  console.log("With values:", values);

  db.query(query, values, (err, result) => {
    if (err) {
      console.error("Error executing query:", err);
      return sendErrorResponse(res, 500, "Internal Server Error.");
    }

    checkAndCreateCustomer(email_address, phone_number, res, (created) => {
      const message = `${tableName.replace("_", " ")} request submitted successfully!`;
      return res.status(201).json({
        message: created
          ? `${message} An account has been created for the customer.`
          : `${message} However, an account could not be created as the email or phone number already exists.`,
      });
    });
  });
};


exports.companyRelocation = (req, res) => {
  handleQuotation(req, res, "company_relocation", [
    "number_of_workstations", "office_size", "list_of_larger_items", "equipment_disassembly", "other_about_move"
  ], [
    req.body.number_of_workstations || null, req.body.office_size || null, JSON.stringify(req.body.list_of_larger_items) || null, req.body.equipment_disassembly || null, req.body.other_about_move || null
  ]);
};

exports.moveOutCleaning = (req, res) => {
  handleQuotation(req, res, "move_out_cleaning", [
    "property_size", "number_of_rooms", "specific_cleaning_requests"
  ], [
    req.body.property_size || null, req.body.number_of_rooms || null, req.body.specific_cleaning_requests || null
  ]);
};

exports.storage = (req, res) => {
  handleQuotation(req, res, "storage", [
    "volume_of_items", "storage_duration", "type_of_items_to_store"
  ], [
    req.body.volume_of_items || null, req.body.storage_duration || null, JSON.stringify(req.body.type_of_items_to_store) || null
  ]);
};

exports.heavyLifting = (req, res) => {
  handleQuotation(req, res, "heavy_lifting", [
    "type_of_items", "weight_of_items", "location_of_lift"
  ], [
    JSON.stringify(req.body.type_of_items) || null, // Serialize as JSON string
    req.body.weight_of_items || null,
    req.body.location_of_lift || null,
  ]);
};



exports.carryingAssistance = (req, res) => {
  handleQuotation(req, res, "carrying_assistance", [
    "type_of_items_to_carry", "standard_or_heavy", "describe_carrying"
  ], [
    JSON.stringify(req.body.type_of_items_to_carry) || null, req.body.standard_or_heavy || null, req.body.describe_carrying || null
  ]);
};

exports.junkRemoval = (req, res) => {
  handleQuotation(req, res, "junk_removal", [
    "type_of_junk", "junk_volume", "junk_requirements"
  ], [
    JSON.stringify(req.body.type_of_junk) || null, req.body.junk_volume || null, req.body.junk_requirements || null
  ]);
};

exports.estateClearance = (req, res) => {
  handleQuotation(req, res, "estate_clearance", [
    "property_size", "type_of_items_to_clear", "items_to_preserve"
  ], [
    req.body.property_size || null, JSON.stringify(req.body.type_of_items_to_clear) || null, JSON.stringify(req.body.items_to_preserve) || null
  ]);
};

exports.evacuationMove = (req, res) => {
  handleQuotation(req, res, "evacuation_move", [
    "evacuation_reason", "temporary_storage", "specific_requests"
  ], [
    req.body.evacuation_reason || null, req.body.temporary_storage || null, req.body.specific_requests || null
  ]);
};

exports.privacyMove = (req, res) => {
  handleQuotation(req, res, "privacy_move", [
    "about_the_move", "specific_requirements"
  ], [
    req.body.about_the_move || null, req.body.specific_requirements || null
  ]);
};

exports.customer_quotation_all = [
  adminIsLoggedIn,
  (req, res) => {
    const { identifier } = req.body;
    if (!identifier) {
      return res.status(400).json({ error: "An identifier (email or phone number) is required." });
    }

    const countQuery = `
      SELECT 
        (SELECT COUNT(*) FROM company_relocation WHERE email_address = ? OR phone_number = ?) +
        (SELECT COUNT(*) FROM move_out_cleaning WHERE email_address = ? OR phone_number = ?) +
        (SELECT COUNT(*) FROM storage WHERE email_address = ? OR phone_number = ?) +
        (SELECT COUNT(*) FROM heavy_lifting WHERE email_address = ? OR phone_number = ?) +
        (SELECT COUNT(*) FROM carrying_assistance WHERE email_address = ? OR phone_number = ?) +
        (SELECT COUNT(*) FROM junk_removal WHERE email_address = ? OR phone_number = ?) +
        (SELECT COUNT(*) FROM estate_clearance WHERE email_address = ? OR phone_number = ?) +
        (SELECT COUNT(*) FROM evacuation_move WHERE email_address = ? OR phone_number = ?) +
        (SELECT COUNT(*) FROM privacy_move WHERE email_address = ? OR phone_number = ?) 
      AS total_quotations
    `;

    const queries = {
      companyRelocation: `SELECT * FROM company_relocation WHERE email_address = ? OR phone_number = ?`,
      moveOutCleaning: `SELECT * FROM move_out_cleaning WHERE email_address = ? OR phone_number = ?`,
      storage: `SELECT * FROM storage WHERE email_address = ? OR phone_number = ?`,
      heavyLifting: `SELECT * FROM heavy_lifting WHERE email_address = ? OR phone_number = ?`,
      carryingAssistance: `SELECT * FROM carrying_assistance WHERE email_address = ? OR phone_number = ?`,
      junkRemoval: `SELECT * FROM junk_removal WHERE email_address = ? OR phone_number = ?`,
      estateClearance: `SELECT * FROM estate_clearance WHERE email_address = ? OR phone_number = ?`,
      evacuationMove: `SELECT * FROM evacuation_move WHERE email_address = ? OR phone_number = ?`,
      privacyMove: `SELECT * FROM privacy_move WHERE email_address = ? OR phone_number = ?`,
    };

    db.query(countQuery, Array(18).fill(identifier), (countErr, countResult) => {
      if (countErr) {
        return sendErrorResponse(res, 500, "Internal Server Error: Unable to get total count.");
      }

      const totalQuotations = countResult[0].total_quotations;
      const results = {};
      const queryPromises = Object.entries(queries).map(([key, query]) => {
        return new Promise((resolve, reject) => {
          db.query(query, [identifier, identifier], (err, rows) => {
            if (err) {
              return reject(err);
            }
            if (rows.length > 0) {
              results[key] = rows;
            }
            resolve();
          });
        });
      });

      Promise.all(queryPromises)
        .then(() => {
          return res.status(200).json({
            message: "Data fetched successfully!",
            totalQuotations,
            data: results,
          });
        })
        .catch((err) => {
          return sendErrorResponse(res, 500, "Internal Server Error: Unable to fetch data.");
        });
    });
  },
];