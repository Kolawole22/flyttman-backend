const db = require("./db/connect");

let io;

const initializeSocket = (server) => {
  io = require("socket.io")(server, {
    cors: {
      origin: (process.env.FRONTEND_URL || "http://localhost:3000"),
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      credentials: true,
      allowedHeaders: ["Content-Type"],
      // maxAge: 3600,
    },
  });

  console.log("Socket.IO server initialized.");

  const activeConnections = new Map();

  io.on("connection", (socket) => {
    console.log("New client connected:", socket.id);

    // Global error handler
    socket.onerror = (error) => {
      console.error("Socket encountered an error:", error);
      socket.emit("error_message", { message: "An unexpected socket error occurred." });
    };

    // Identify user as admin or customer
    socket.on("identify", (data) => {
      const { email } = data;

      const query = `
        SELECT 'customers' AS type, id, email FROM customers WHERE email = ?
        UNION
        SELECT 'admin' AS type, id, email, role FROM admins WHERE email = ?
      `;

      db.query(query, [email, email], (err, results) => {
        if (err) {
          console.error("Database query error:", err);
          socket.emit("error_message", { message: "Database query failed." });
          return;
        }

        if (results.length > 0) {
          const user = results[0];
          if (user.type === "admin") {
            socket.join(`admin_${user.id}`);
            activeConnections.set(socket.id, {
              type: "admin",
              id: user.id,
              email: user.email,
            });
            console.log(`Admin ${user.id} connected.`);
          } else if (user.type === "customer") {
            socket.join(`customer_${user.email}`);
            activeConnections.set(socket.id, {
              type: "customer",
              id: user.id,
              email: user.email,
            });
            console.log(`Customer ${user.email} connected.`);
          }
        } else {
          socket.emit("error_message", { message: "User not found." });
          console.log("User not found in database:", email);
        }
      });
    });

    // Handle conversation joining
    socket.on("join_conversation", (conversation_id) => {
      socket.join(`conversation_${conversation_id}`);
      console.log(`Joined conversation room: conversation_${conversation_id}`);
    });

    // Handle conversation leaving
    socket.on("leave_conversation", (conversation_id) => {
      socket.leave(`conversation_${conversation_id}`);
      console.log(`Left conversation room: conversation_${conversation_id}`);
    });

    // Handle sending messages
    socket.on("send_message", (data) => {
      const { conversation_id, content } = data;
      const sender = activeConnections.get(socket.id);

      if (!sender) {
        console.log("Sender not found for socket id:", socket.id);
        return;
      }

      try {
        io.to(`conversation_${conversation_id}`).emit("new_message", {
          conversation_id,
          content,
          sender: sender.email || sender.id,
        });
        console.log(`Message sent to conversation_${conversation_id}`);
      } catch (error) {
        console.error("Error sending message:", error);
        socket.emit("error_message", { message: "Failed to send message." });
      }
    });

    // Typing indicators
    socket.on("typing_start", (data) => {
      const { conversation_id } = data;
      const sender = activeConnections.get(socket.id);

      if (sender) {
        io.to(`conversation_${conversation_id}`).emit("typing_indicator", {
          conversation_id,
          is_typing: true,
          sender_type: sender.type,
        });
        console.log(`Typing started in conversation_${conversation_id}`);
      }
    });

    socket.on("typing_end", (data) => {
      const { conversation_id } = data;
      const sender = activeConnections.get(socket.id);

      if (sender) {
        io.to(`conversation_${conversation_id}`).emit("typing_indicator", {
          conversation_id,
          is_typing: false,
          sender_type: sender.type,
        });
        console.log(`Typing ended in conversation_${conversation_id}`);
      }
    });

    // Handle disconnection
    socket.on("disconnect", () => {
      const user = activeConnections.get(socket.id);
      if (user) {
        console.log(
          `${user.type} disconnected: ${
            user.type === "admin" ? user.id : user.email
          }`
        );
        activeConnections.delete(socket.id);
      } else {
        console.log("Unknown client disconnected:", socket.id);
      }
    });
  });
};

const getIO = () => {
  if (!io) {
    throw new Error("Socket.IO not initialized!");
  }
  return io;
};

module.exports = { initializeSocket, getIO };
