// backend/config/rateLimiters.js
// Rate limiters for admin endpoints

const rateLimit = require("express-rate-limit");

const adminBanLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 requests per minute
  keyGenerator: (req) => req.user?.uid || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error:
      "Too many user ban/unban actions. Please try again later (max 20 per minute).",
  },
  skip: (req) => process.env.NODE_ENV !== "production",
});

const adminPromoteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 promotions per hour
  keyGenerator: (req) => req.user?.uid || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error:
      "Too many admin promotion actions. Please try again later (max 10 per hour).",
  },
  skip: (req) => process.env.NODE_ENV !== "production",
});

const adminSuspendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 suspensions per hour
  keyGenerator: (req) => req.user?.uid || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error:
      "Too many admin suspension actions. Please try again later (max 5 per hour).",
  },
  skip: (req) => process.env.NODE_ENV !== "production",
});

module.exports = {
  adminBanLimiter,
  adminPromoteLimiter,
  adminSuspendLimiter,
};
