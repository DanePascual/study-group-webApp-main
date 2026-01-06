// backend/config/constants.js
// Centralized backend constants and environment fallbacks.

const DEFAULT_INSTITUTION_EMAIL_DOMAIN = "paterostechnologicalcollege.edu.ph";

module.exports = {
  INSTITUTION_EMAIL_DOMAIN:
    process.env.INSTITUTION_EMAIL_DOMAIN || DEFAULT_INSTITUTION_EMAIL_DOMAIN,
};
