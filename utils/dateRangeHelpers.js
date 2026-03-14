const moment = require("moment");

/**
 * Returns all YYYY-MM values between startDate and endDate inclusive.
 * Example:
 * startDate = 2026-01-10
 * endDate   = 2026-03-05
 * returns ["2026-01", "2026-02", "2026-03"]
 */
exports.getYearMonthsBetweenDates = (startDate, endDate) => {
  const start = moment(startDate).startOf("month");
  const end = moment(endDate).startOf("month");

  const months = [];
  const current = start.clone();

  while (current.isSameOrBefore(end, "month")) {
    months.push(current.format("YYYY-MM"));
    current.add(1, "month");
  }

  return months;
};

/**
 * Safely parses activation_date_raw like "1/12/26" into a moment object.
 */
exports.parseActivationRawDate = (rawDate) => {
  return moment(rawDate, ["M/D/YY", "MM/DD/YY", "M/DD/YY", "MM/D/YY"], true);
};

/**
 * Checks whether activation_date_raw lies between startDate and endDate inclusive.
 */
exports.isRawDateWithinRange = (rawDate, startDate, endDate) => {
  const parsed = exports.parseActivationRawDate(rawDate);

  if (!parsed.isValid()) return false;

  const start = moment(startDate).startOf("day");
  const end = moment(endDate).endOf("day");

  return parsed.isBetween(start, end, null, "[]");
};