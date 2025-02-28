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
    if (price < 6000) return "0-6";
    if (price < 10000) return "6-10";
    if (price < 15000) return "10-15";
    if (price < 20000) return "15-20";
    if (price < 30000) return "20-30";
    if (price < 40000) return "30-40";
    if (price < 70000) return "40-70";
    return "100";
  };

exports.generateIdentifier = (name) => {
    return name.replace(/\s+/g, "_").toLowerCase().substring(0, 12);
  };