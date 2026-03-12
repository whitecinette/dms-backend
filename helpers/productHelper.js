const { v4: uuidv4 } = require("uuid");

exports.generateProductCode = async (model) => {
    // Generate a unique UUID
    const uniqueId = uuidv4().split("-")[0]; // Extract the first part for brevity

    // Create a base product code
    let productCode = `${model.toUpperCase().replace(/\s+/g, "-")}-${uniqueId}`;

    return productCode; // UUID is already unique, no need to check the database
};

exports.cleanHeader = (header) => {
    return header.trim().toLowerCase().replace(/\s+/g, "_");
  };

exports.cleanCategory = (category) => {
    return category.trim().toLowerCase().replace(/\s+/g, "_");
  };
  

exports.determineSegment = (price) => {
  const p = Number(price);

  if (!p || p <= 0) return "";
  if (p < 6000) return "0-6";
  if (p <= 10000) return "6-10";
  if (p <= 15000) return "10-15";
  if (p <= 20000) return "15-20";
  if (p <= 30000) return "20-30";
  if (p <= 40000) return "30-40";
  if (p <= 70000) return "40-70";
  if (p <= 100000) return "70-100";
  if (p <= 120000) return "100-120";
  return "120";
};

exports.generateIdentifier = (name) => {
  if (!name || typeof name !== "string") return "unknown";
  return name.replace(/\s+/g, "_").toLowerCase().substring(0, 12);
  };