const { v4: uuidv4 } = require("uuid");

exports.generateProductCode = async (model) => {
    // Generate a unique UUID
    const uniqueId = uuidv4().split("-")[0]; // Extract the first part for brevity

    // Create a base product code
    let productCode = `${model.toUpperCase().replace(/\s+/g, "-")}-${uniqueId}`;

    return productCode; // UUID is already unique, no need to check the database
};
