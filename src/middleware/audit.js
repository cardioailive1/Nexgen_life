// src/middleware/audit.js
function auditMiddleware(req, res, next) {
  // Attach IP helper for downstream use
  req.clientIp = req.ip || req.connection?.remoteAddress || 'unknown';
  next();
}
module.exports = { auditMiddleware };
