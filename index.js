const express = require("express");
const dotenv = require("dotenv");
const bodyParser = require("body-parser");
const http = require("http");
const cors = require("cors");
const expressSession = require("express-session");
const fileUpload = require("express-fileupload");
const { v4: uuidv4 } = require("uuid");
const { getIO } = require("./socket");
const path = require("path"); // Add this line
// Import custom modules
const db = require("./db/connect");
const { initializeSocket } = require("./socket");
const {
  schedulePaymentReleases,
} = require("./server/schedulers/paymentScheduler");
const notificationService = require("./utils/notificationService");
const runAuctionCron = require("./server/cron/auctionCron");
const reviewScheduler = require("./server/schedulers/reviewScheduler");

// Load environment variables
dotenv.config();

// Initialize Express and HTTP Server
const app = express();
const server = http.createServer(app);

// Generate a new UUID for session secret
const sessionSecret = uuidv4();

// Middleware Configuration
app.use(
  cors({
    origin: (origin, callback) => {
      const allowedOrigins = [
        process.env.FRONTEND_URL || "https://flyttman.se",
        "http://localhost:3010",
        "https://flyttmanadmin.vercel.app",
      ];

      if (allowedOrigins.includes(origin) || !origin) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true, // Allows cookies and authorization headers to be sent
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);

// app.use((req, res, next) => {
//   res.header(
//     "Access-Control-Allow-Origin", process.env.FRONTEND_URL || "http://localhost:3010"
//   ); // Adjust for your environment
//   res.header(
//     "Access-Control-Allow-Methods",
//     "GET,POST,PUT,DELETE,PATCH,OPTIONS"
//   );
//   res.header(
//     "Access-Control-Allow-Headers",
//     "Content-Type, Authorization, X-Requested-With"
//   );
//   next();
// });

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(fileUpload());

app.use(
  expressSession({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false, //process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000, // 1 day
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    },
    name: "sessionId",
  })
);

// Initialize Socket.IO
const io = initializeSocket(server);

// API Routes
const customerRoutes = require("./server/routes/customerRoutes");
const adminRoutes = require("./server/routes/adminRoutes");
const quotationRoutes = require("./server/routes/quotationRoutes");
const supplierRoutes = require("./server/routes/supplierRoutes");
const reviewRoutes = require("./server/routes/reviewRoutes");
const supplierRatingsRoutes = require("./server/routes/supplierRatings");
const adminReviewsRoutes = require("./server/routes/adminReviews");
const calendarRoutes = require("./server/routes/calendar");
const adminMessagesRoutes = require("./server/routes/adminMessages");
const customerMessagesRoutes = require("./server/routes/customerMessages");
const notificationRoutes = require("./server/routes/notificationRoutes");
const disputesRouter = require("./server/routes/disputesRoutes");
const adminDisputesRoutes = require("./server/routes/adminDisputeRoutes");
const disputeChatRoutes = require("./server/routes/disputeChatRoutes");

// Other routes
app.use("/api/notifications", notificationRoutes);

app.use("/api/supplierRatings", supplierRatingsRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/admins", adminRoutes);
app.use("/api/quotations", quotationRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/adminReviews", adminReviewsRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/adminmessages", adminMessagesRoutes);
app.use("/api/customermessages", customerMessagesRoutes);
app.use("/api/disputes", disputesRouter);
app.use("/api/admin-dispute", adminDisputesRoutes);
app.use("/api/dispute-chat", disputeChatRoutes);

// Add static file serving for dispute uploads
app.use(
  "/uploads/disputes",
  express.static(path.join(__dirname, "uploads/disputes"))
); // Add this line

// Start Background Processes
schedulePaymentReleases();
runAuctionCron();
reviewScheduler.start();

app.set("trust proxy", true);

// Default Route
app.get("/", (req, res) => {
  res.status(200).json({ message: "Server is running!" });
});

// Start Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Initialize NotificationService
notificationService.emitNotification = function (notification) {
  const io = getIO(); // Use the initialized socket instance
  const room = `${notification.recipientType}_${notification.recipientId}`;
  io.to(room).emit("notification", notification);
};
