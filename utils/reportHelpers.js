// =============================
// Get last 3 months
// =============================
exports.getLastThreeMonths = (selectedMonth) => {
  const [year, month] = selectedMonth.split("-").map(Number);

  const months = [];

  for (let i = 2; i >= 0; i--) {
    let newMonth = month - i;
    let newYear = year;

    if (newMonth <= 0) {
      newMonth += 12;
      newYear -= 1;
    }

    months.push(
      `${newYear}-${newMonth.toString().padStart(2, "0")}`
    );
  }

  return months;
};

// =============================
// Get yesterday in India timezone
// =============================
exports.getYesterdayIndia = () => {
  const now = new Date();

  const utc =
    now.getTime() + now.getTimezoneOffset() * 60000;

  const indiaTime = new Date(utc + 5.5 * 60 * 60000);

  indiaTime.setDate(indiaTime.getDate() - 1);

  const month = indiaTime.getMonth() + 1;
  const day = indiaTime.getDate();
  const year = indiaTime.getFullYear().toString().slice(-2);

  return `${month}/${day}/${year}`;
};
