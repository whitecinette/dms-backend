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


exports.parseIndianDate = (dateStr) => {
  const [month, day, year] = dateStr.split("/");
  const fullYear = year.length === 2 ? "20" + year : year;

  return {
    year: Number(fullYear),
    month: Number(month),
    day: Number(day),
  };
};

const toComparable = (d) => {
  return d.year * 10000 + d.month * 100 + d.day;
};

const getDealerCodesByActor = async (actorType, actorCode) => {
  if (!actorType || !actorCode) return null;

  const filter = {};
  filter[`${actorType}_code`] = actorCode;

  const dealers = await DealerHierarchy.find(filter).select("dealer_code");

  return dealers.map((d) => d.dealer_code);
};

exports.getActivationReport = async ({
  startDate,
  endDate,
  actorType,
  actorCode,
}) => {
  const start = parseIndian(startDate);
  const end = parseIndianDate(endDate);

  const startComp = toComparable(start);
  const endComp = toComparable(end);

  // Get dealer filter if actor applied
  const dealerCodes = await getDealerCodesByActor(actorType, actorCode);

  let matchFilter = {};

  if (dealerCodes) {
    matchFilter.$or = [
      { tertiary_buyer_code: { $in: dealerCodes } },
      { tertiary_seller_code: { $in: dealerCodes } },
    ];
  }

  const allData = await ActivationData.find(matchFilter);

  let mtdVal = 0;
  let mtdVol = 0;

  let ftdVal = 0;
  let ftdVol = 0;

  let lmtdVal = 0;
  let lmtdVol = 0;

  const monthWise = {};

  allData.forEach((doc) => {
    const d = parseIndianDate(doc.activation_date_raw);
    const comp = toComparable(d);

    const keyMonth = `${d.year}-${String(d.month).padStart(2, "0")}`;

    // Month-wise totals
    if (!monthWise[keyMonth]) {
      monthWise[keyMonth] = { val: 0, vol: 0 };
    }

    monthWise[keyMonth].val += doc.val;
    monthWise[keyMonth].vol += doc.qty;

    // MTD
    if (comp >= startComp && comp <= endComp) {
      mtdVal += doc.val;
      mtdVol += doc.qty;
    }

    // FTD (yesterday only)
    const yesterdayComp =
      endComp - 1; // safe because numeric YYYYMMDD

    if (comp === yesterdayComp) {
      ftdVal += doc.val;
      ftdVol += doc.qty;
    }

    // LM TD (same date range previous month)
    if (
      d.month === start.month - 1 &&
      d.day <= end.day &&
      d.year === start.year
    ) {
      lmtdVal += doc.val;
      lmtdVol += doc.qty;
    }
  });

  // Growth %
  const growth =
    lmtdVal === 0 ? 0 : ((mtdVal - lmtdVal) / lmtdVal) * 100;

  return {
    monthWise,
    mtd: { value: mtdVal, volume: mtdVol },
    lmtd: { value: lmtdVal, volume: lmtdVol },
    ftd: { value: ftdVal, volume: ftdVol },
    growthPercent: Number(growth.toFixed(2)),
  };
};


