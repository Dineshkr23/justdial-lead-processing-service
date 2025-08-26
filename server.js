import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import { connectDB } from "./config/database.js";
import { logger } from "./utils/logger.js";
import leadRoutes from "./routes/leadRoutes.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFound } from "./middleware/notFound.js";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Trust proxy configuration for proper IP handling
app.set(
  "trust proxy",
  process.env.TRUST_PROXY === "true" || process.env.NODE_ENV === "production"
);

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// CORS configuration
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(",") || "*",
    credentials: true,
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000, // limit each IP to 1000 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  // Trust proxy to handle X-Forwarded-For headers properly
  trustProxy: true,
  // Custom key generator to handle malformed X-Forwarded-For headers
  keyGenerator: (req) => {
    try {
      // Get the real IP address, handling various proxy scenarios
      const forwarded = req.headers["x-forwarded-for"];
      if (forwarded) {
        // Handle IPv6-mapped IPv4 addresses and multiple IPs
        const ips = forwarded.split(",").map((ip) => ip.trim());
        const firstIp = ips[0];

        // Handle IPv6-mapped IPv4 addresses (::ffff:xxx.xxx.xxx.xxx)
        if (firstIp.startsWith("::ffff:")) {
          return firstIp.substring(7); // Remove ::ffff: prefix
        }

        // Validate IP format
        if (firstIp && (firstIp.includes(".") || firstIp.includes(":"))) {
          return firstIp;
        }
      }

      // Fallback to Express's IP detection
      return (
        req.ip ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        "unknown"
      );
    } catch (error) {
      logger.error("Error generating rate limit key:", error);
      return "unknown";
    }
  },
  // Skip rate limiting for health checks
  skip: (req) => req.path === "/health",
});
app.use(limiter);

// Compression middleware
app.use(compression());

// Logging middleware
app.use(
  morgan("combined", {
    stream: { write: (message) => logger.info(message.trim()) },
  })
);

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
  });
});

// API routes
app.use("/api/leads", leadRoutes);

// 404 handler
app.use(notFound);

// Error handling middleware
app.use(errorHandler);

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down gracefully");
  process.exit(0);
});

// Start server
const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();

    app.listen(PORT, () => {
      logger.info(
        `🚀 Server running on port ${PORT} in ${process.env.NODE_ENV || "development"} mode`
      );
      logger.info(`📊 Health check: http://localhost:${PORT}/health`);
      logger.info(`📝 Lead API: http://localhost:${PORT}/api/leads`);
    });
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();

export default app;
