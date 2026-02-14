const XLSX = require("xlsx");

const getYearMonth = (dateStr) => {
  const parts = dateStr.split("/");
  const month = parts[0].padStart(2, "0");
  let year = parts[2];

  if (year.length === 2) year = "20" + year;

  return `${year}-${month}`;
};

const parseFile = (fileBuffer, originalName) => {
  const fileExt = originalName.split(".").pop().toLowerCase();

  let workbook;

  if (fileExt === "csv") {
    workbook = XLSX.read(fileBuffer.toString(), { type: "string" });
  } else {
    workbook = XLSX.read(fileBuffer, { type: "buffer" });
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
};
