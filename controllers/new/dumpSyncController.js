const XLSX = require("xlsx");
const { parse } = require("csv-parse/sync");
const Product = require("../../model/Product"); // adjust path if needed
const { registerOrUpdateUsersFromActorCodes } = require("../admin/userController");
const ActorCode = require("../../model/ActorCode");


// ---------- file parsing (xlsx/xls/csv) ----------


function parseDumpFile(buffer, originalname) {
  const name = (originalname || "").toLowerCase();

  // CSV support
  if (name.endsWith(".csv")) {
    const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
    return parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      delimiter: text.includes("\t") ? "\t" : ",", // handles tab dumps too
    });
  }

  // Excel support
  const workbook = XLSX.read(buffer, { type: "buffer" });
  console.log("SHEETS:", workbook.SheetNames);

    for (const n of workbook.SheetNames) {
    const sh = workbook.Sheets[n];
    console.log("SHEET:", n, "REF:", sh?.["!ref"]);
    }

  // you said single sheet named Dump — still safer to pick first sheet
  const sheetName = workbook.SheetNames?.[0];
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];

  // 1) normal read
  let rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });

  // 2) fallback if empty
  if (!rows || !rows.length) {
    const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
    if (!aoa || aoa.length < 2) return [];

    const headers = (aoa[0] || []).map(h => String(h).trim()).filter(Boolean);
    rows = aoa.slice(1).map(r => {
      const obj = {};
      headers.forEach((h, i) => (obj[h] = r?.[i] ?? ""));
      return obj;
    });
  }

  // normalize keys (trim spaces)
  return rows.map(r => {
    const o = {};
    Object.keys(r).forEach(k => (o[String(k).trim()] = r[k]));
    return o;
  });
}

// ---------- helpers ----------
function toNumber(val) {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number") return val;
  const s = String(val).replace(/,/g, "").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function normalizeBrand() {
  return "samsung";
}

function normalizeProductCategory(segmentVal) {
  const s = String(segmentVal || "").toLowerCase().trim();

  if (s.includes("tab") || s.includes("tablet")) return "tab";
  if (s.includes("wear") || s.includes("watch") || s.includes("buds") || s.includes("hear")) return "wearable";
  if (s.includes("phone")) return "smart_phone";

  // default (your dump is mostly phones)
  return "smart_phone";
}

function cleanCode(v) {
  return String(v || "").trim().toUpperCase();
}
function cleanName(v) {
  return String(v || "").trim();
}

// bucket from numeric price (preferred)
function bucketFromPrice(price) {
  if (!price || price <= 0) return "";

  // include 10,000 dp in 6-10
  if (price <= 10000) return "6-10";
  if (price <= 20000) return "10-20";
  if (price <= 30000) return "20-30";
  if (price <= 40000) return "30-40";
  if (price <= 70000) return "40-70";
  if (price <= 100000) return "70-100";
  return "100";
}

// fallback parse from strings like "10~15K", "10-15K", "30 K - 40 K", "10 K-15 K"
function bucketFromRangeString(rangeStr) {
  const s = String(rangeStr || "").toLowerCase().trim();
  if (!s) return "";

  // extract numbers in the string
  const nums = s.match(/\d+(\.\d+)?/g);
  if (!nums || nums.length === 0) return "";

  // if it contains 'k', interpret as thousands
  const hasK = s.includes("k");

  // take the upper bound if present, else single number
  let n = Number(nums[Math.min(nums.length - 1, 1)] || nums[0]);
  if (!Number.isFinite(n)) return "";

  if (hasK) n = n * 1000;

  return bucketFromPrice(n);
}

function normalizeSegment(pricePerUnit, segmentNew, priceBand) {
  const price = toNumber(pricePerUnit);
  const byPrice = bucketFromPrice(price);
  if (byPrice) return byPrice;

  const bySegNew = bucketFromRangeString(segmentNew);
  if (bySegNew) return bySegNew;

  const byBand = bucketFromRangeString(priceBand);
  if (byBand) return byBand;

  return "";
}


/////////////////////////////////
/////////////////////////////////////////////
// ---------- controller ----------
///////////////////////////////////////////////////
////////////////////////////

exports.uploadSamsungDumpProducts = async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ message: "File is required" });
    }

    const dryRun = String(req.query.dryRun || "false").toLowerCase() === "true";

    console.log("HAS FILE?", !!req.file);
    console.log("FILE SIZE:", req.file?.size);
    console.log("ORIGINAL:", req.file?.originalname);
    console.log("FILE FIRST 8 BYTES HEX:", req.file.buffer.slice(0, 8).toString("hex"));
    console.log("FILE FIRST 4 CHARS:", req.file.buffer.slice(0, 4).toString());

    // ✅ IMPORTANT: call the correct function
    const rows = parseDumpFile(req.file.buffer, req.file.originalname);

    console.log("PARSED ROW COUNT:", rows.length);
    if (rows.length) {
      console.log("FIRST ROW KEYS:", Object.keys(rows[0] || {}).slice(0, 30));
      console.log("FIRST 2 ROWS:", JSON.stringify(rows.slice(0, 2), null, 2));
    }

    if (!rows.length) {
      return res.status(400).json({ message: "Empty file (parser returned 0 rows)" });
    }

    const brand = normalizeBrand();

    // unique product_code map (ignore blank)
    const map = new Map();
    for (const r of rows) {
      const product_code = String(r.ProductCode || r["ProductCode"] || "").trim();
      if (!product_code) continue;
      if (!map.has(product_code)) map.set(product_code, r);
    }

    const uniqueCodes = Array.from(map.keys());
    if (!uniqueCodes.length) {
      return res.status(400).json({ message: "No ProductCode found in file" });
    }

    // find existing
    const existing = await Product.find(
      { brand, product_code: { $in: uniqueCodes } },
      { product_code: 1 }
    ).lean();

    const existingSet = new Set(existing.map((p) => String(p.product_code)));

    // build docs to insert (only missing)
    const toInsert = [];
    for (const code of uniqueCodes) {
      if (existingSet.has(code)) continue;

      const r = map.get(code);

      const product_name = String(r.MarketName || "").trim();
      const model_code = String(r.Modelcode || "").trim();
      const category = String(r.Category || "").trim();

      const price = toNumber(r["Price Per Unit"]);
      const product_category = normalizeProductCategory(r.Segment);
      const segment = normalizeSegment(price, r["Segment New"], r["Price Band"]);

      // skip invalid
      if (!product_name || !price) continue;

      toInsert.push({
        brand,
        product_name,
        product_category,
        price,
        segment,
        model_code,
        status: "active",
        isAvailable: true,

        product_code: code,
        category,
        source: "dump",
        extraction_active: "FALSE",
      });
    }

    const summary = {
      success: true,
      dryRun,
      totalRows: rows.length,
      uniqueProductsInFile: uniqueCodes.length,
      existingInDb: existingSet.size,
      toInsert: toInsert.length,
      inserted: 0,
      skipped: uniqueCodes.length - toInsert.length,
      errors: 0,
    };

    if (dryRun) {
      return res.json({ ...summary, sampleNewProducts: toInsert.slice(0, 20) });
    }

    if (!toInsert.length) {
      return res.json({ ...summary, message: "No new products to insert" });
    }

    try {
      const insertedDocs = await Product.insertMany(toInsert, { ordered: false });
      summary.inserted = insertedDocs.length;
      summary.message = `Inserted ${summary.inserted} new products`;
      return res.json(summary);
    } catch (err) {
      const writeErrors = err?.writeErrors || [];
      summary.inserted = Math.max(0, toInsert.length - writeErrors.length);
      summary.errors = writeErrors.length;
      summary.message = `Inserted ${summary.inserted} new products (some duplicates skipped)`;
      return res.json(summary);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Dump sync failed" });
  }
};

exports.syncMddDealerFromDump = async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ message: "File is required" });
    }

    const dryRun = String(req.query.dryRun || "false").toLowerCase() === "true";

    // reuse your parser
    const rows = parseDumpFile(req.file.buffer, req.file.originalname);

    if (!rows.length) {
      return res.status(400).json({ message: "Empty file (parser returned 0 rows)" });
    }

    // collect unique actors (mdd + dealer)
    const map = new Map();

    for (const r of rows) {
      // MDD
      const mddCode = cleanCode(r["MDD Code"] || r.MDDCode);
      const mddName = cleanName(r["MDD Name"] || r.MDDName);
      if (mddCode && mddName) {
        map.set(`mdd:${mddCode}`, {
          code: mddCode,
          name: mddName,
          position: "mdd",
          role: "mdd",
          status: "active",
        });
      }

      // Dealer (only when Buyer Type = Dealer)
      const buyerType = String(r["Buyer Type"] || r.BuyerType || "")
        .trim()
        .toLowerCase();

      if (buyerType === "dealer") {
        const dealerCode = cleanCode(r["BuyerCode"] || r.BuyerCode);
        const dealerName = cleanName(r["BuyerName"] || r.BuyerName);
        if (dealerCode && dealerName) {
          map.set(`dealer:${dealerCode}`, {
            code: dealerCode,
            name: dealerName,
            position: "dealer",
            role: "dealer",
            status: "active",
          });
        }
      }
    }

    const actors = Array.from(map.values());
    if (!actors.length) {
      return res.status(400).json({ message: "No MDD/Dealer found in dump" });
    }

    // find existing by code
    const codes = actors.map((a) => a.code);
    const existing = await ActorCode.find(
      { code: { $in: codes } },
      { code: 1 }
    ).lean();

    const existingSet = new Set(existing.map((x) => cleanCode(x.code)));

    // insert only missing
    const toInsert = actors.filter((a) => !existingSet.has(a.code));

    const summary = {
      success: true,
      dryRun,
      totalRows: rows.length,
      uniqueActorsInFile: actors.length,
      existingMatched: existing.length,
      newActorsToInsert: toInsert.length,
      inserted: 0,
      usersSynced: false,
    };

    if (dryRun) {
      return res.json({ ...summary, sampleActors: toInsert.slice(0, 30) });
    }

    if (!toInsert.length) {
      // still optional: sync users anyway (harmless)
      const fakeRes = { status: () => fakeRes, json: () => {} };
      await registerOrUpdateUsersFromActorCodes(req, fakeRes);

      return res.json({ ...summary, usersSynced: true, message: "No new MDD/Dealer to insert" });
    }

    // insert (ignore duplicates just in case)
    try {
      const insertedDocs = await ActorCode.insertMany(toInsert, { ordered: false });
      summary.inserted = insertedDocs.length;
    } catch (err) {
      // if duplicates slipped in due to race, handle gracefully
      const writeErrors = err?.writeErrors || [];
      summary.inserted = Math.max(0, toInsert.length - writeErrors.length);
    }

    // sync users from actor codes
    const fakeRes = { status: () => fakeRes, json: () => {} };
    await registerOrUpdateUsersFromActorCodes(req, fakeRes);
    summary.usersSynced = true;

    return res.json({ ...summary, message: `Inserted ${summary.inserted} new actors` });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "MDD/Dealer sync failed", error: err.message });
  }
};
