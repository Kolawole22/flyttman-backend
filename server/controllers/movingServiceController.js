const db = require("../../db/connect");
const bcrypt = require("bcryptjs");

const validateBaseFields = (req) => {
  const {
    from_city,
    to_city,
    move_date,
    type_of_service,
    email_address,
    phone_number,
  } = req.body;
  if (
    !from_city ||
    !to_city ||
    !move_date ||
    !type_of_service ||
    !email_address ||
    !phone_number
  ) {
    return { isValid: false, error: "Missing required fields." };
  }
  return { isValid: true };
};

exports.movingService = (req, res) => {
  const {
    from_city,
    to_city,
    move_date,
    type_of_service,
    email_address,
    phone_number,
    volume_of_items,
    property_size,
    floor_details,
    list_of_larger_items,
    needs_packing,
    needs_dump_service,
    heavy_lifting_required,
  } = req.body;

  // Validate basic fields
  const validation = validateBaseFields(req, res);
  if (!validation.isValid) {
    return res.status(400).json({ error: validation.error });
  }

  // Validate type_of_service
  const allowedServices = ["local_move", "long_distance_move", "moving_abroad"];
  const validServices =
    Array.isArray(type_of_service) &&
    type_of_service.every((service) => allowedServices.includes(service));

  if (!validServices) {
    return res.status(400).json({
      error:
        "Invalid type of service. Must be one or more of: local_move, long_distance_move, moving_abroad",
    });
  }

  const query = `
      INSERT INTO moving_service (
        from_city, 
        to_city, 
        move_date, 
        type_of_service, 
        email_address, 
        phone_number, 
        volume_of_items, 
        property_size, 
        floor_details, 
        list_of_larger_items, 
        needs_packing, 
        needs_dump_service, 
        heavy_lifting_required
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

  const values = [
    from_city,
    to_city,
    move_date,
    JSON.stringify(type_of_service),
    email_address,
    phone_number,
    volume_of_items || null,
    property_size || null,
    floor_details || null,
    list_of_larger_items || null,
    needs_packing || false,
    needs_dump_service || false,
    heavy_lifting_required || false,
  ];

  // Insert moving service data into the database
  db.query(query, values, (err, result) => {
    if (err) {
      console.error("Error inserting data:", err);
      return res.status(500).json({ error: "Internal Server Error" });
    }

    console.log("Moving service data inserted successfully.");

    // Check if an account already exists in the `customers` table
    const checkCustomerQuery = `
        SELECT id FROM customers WHERE email = ?
      `;
    db.query(checkCustomerQuery, [email_address], (checkErr, checkResults) => {
      if (checkErr) {
        console.error("Error checking customer account:", checkErr);
        return res.status(500).json({ error: "Internal Server Error" });
      }

      // If an account exists, do nothing
      if (checkResults.length > 0) {
        return res.status(201).json({
          message:
            "Moving service request submitted successfully! Account already exists.",
        });
      }

      // If no account exists, create one
      const saltRounds = 10;
      bcrypt.hash(phone_number, saltRounds, (hashErr, hashedPassword) => {
        if (hashErr) {
          console.error("Error hashing password:", hashErr);
          return res.status(500).json({ error: "Internal Server Error" });
        }

        const createCustomerQuery = `
            INSERT INTO customers (email, password)
            VALUES (?, ?)
          `;
        db.query(
          createCustomerQuery,
          [email_address, hashedPassword],
          (createErr) => {
            if (createErr) {
              console.error("Error creating customer account:", createErr);
              return res.status(500).json({ error: "Internal Server Error" });
            }

            return res.status(201).json({
              message:
                "Moving service request submitted successfully! Account created for the customer.",
            });
          }
        );
      });
    });
  });
};
