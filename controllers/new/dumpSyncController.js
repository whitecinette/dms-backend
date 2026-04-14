const XLSX = require("xlsx");
const { parse } = require("csv-parse/sync");
const Product = require("../../model/Product"); // adjust path if needed
const { registerOrUpdateUsersFromActorCodes } = require("../admin/userController");
const ActorCode = require("../../model/ActorCode");
const csv = require("csv-parser");
const { Readable } = require("stream");
const User = require("../../model/User");
const HierarchyEntries = require("../../model/HierarchyEntries");

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

function parseCsvRowsWithHeaders(buffer) {
  const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
  const rows = parse(text, {
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    delimiter: text.includes("\t") ? "\t" : ",",
  });

  if (!rows.length) {
    return { headers: [], rows: [] };
  }

  const headers = (rows[0] || []).map((header) => String(header || "").trim());
  const body = rows.slice(1);

  return {
    headers,
    rows: body.map((row) => headers.map((_, index) => row?.[index] ?? "")),
  };
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

function normalizeTagValue(value) {
  return String(value || "").trim();
}

function normalizeTagKey(value) {
  return normalizeTagValue(value).toLowerCase();
}

function dedupeTagsCaseInsensitive(tags = []) {
  const seen = new Set();
  const output = [];

  tags.forEach((tag) => {
    const cleaned = normalizeTagValue(tag);
    const key = normalizeTagKey(cleaned);

    if (!cleaned || seen.has(key)) {
      return;
    }

    seen.add(key);
    output.push(cleaned);
  });

  return output;
}

// bucket from numeric price (preferred)
function bucketFromPrice(price) {
  if (!price || price <= 0) return "";

  if (price <= 6000) return "0-6";
  if (price <= 10000) return "6-10";
  if (price <= 20000) return "10-20";
  if (price <= 30000) return "20-30";
  if (price <= 40000) return "30-40";
  if (price <= 70000) return "40-70";
  if (price <= 100000) return "70-100";
  if (price <= 120000) return "100-120";
  return "120";
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
      { product_code: 1, price: 1, segment: 1 }
    ).lean();

    const existingMap = new Map(
      existing.map((p) => [String(p.product_code), p])
    );
    const existingSet = new Set(existing.map((p) => String(p.product_code)));

    // build docs to insert/update
    const toInsert = [];
    const toUpdate = [];
    for (const code of uniqueCodes) {
      const r = map.get(code);

      const product_name = String(r.MarketName || "").trim();
      const model_code = String(r.Modelcode || "").trim();
      const category = String(r.Category || "").trim();

      const price = toNumber(r["Price Per Unit"]);
      const product_category = normalizeProductCategory(r.Segment);
      const segment = normalizeSegment(price, r["Segment New"], r["Price Band"]);

      // skip invalid
      if (!product_name || !price) continue;

      const existingProduct = existingMap.get(code);
      if (existingProduct) {
        const priceChanged = Number(existingProduct.price || 0) !== Number(price);
        const segmentChanged = String(existingProduct.segment || "") !== String(segment || "");

        if (priceChanged || segmentChanged) {
          toUpdate.push({
            product_code: code,
            oldPrice: existingProduct.price ?? null,
            newPrice: price,
            oldSegment: existingProduct.segment || "",
            newSegment: segment,
          });
        }
        continue;
      }

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
      toUpdate: toUpdate.length,
      inserted: 0,
      updated: 0,
      skipped: uniqueCodes.length - toInsert.length - toUpdate.length,
      errors: 0,
    };

    if (dryRun) {
      return res.json({
        ...summary,
        sampleNewProducts: toInsert.slice(0, 20),
        sampleUpdates: toUpdate.slice(0, 20),
      });
    }

    if (!toInsert.length && !toUpdate.length) {
      return res.json({ ...summary, message: "No product inserts or updates required" });
    }

    if (toUpdate.length) {
      const bulkOps = toUpdate.map((item) => ({
        updateOne: {
          filter: { brand, product_code: item.product_code },
          update: {
            $set: {
              price: item.newPrice,
              segment: item.newSegment,
            },
          },
        },
      }));

      const updateResult = await Product.bulkWrite(bulkOps, { ordered: false });
      summary.updated = updateResult.modifiedCount || 0;
    }

    if (!toInsert.length) {
      summary.message = `Updated ${summary.updated} existing products`;
      return res.json(summary);
    }

    try {
      const insertedDocs = await Product.insertMany(toInsert, { ordered: false });
      summary.inserted = insertedDocs.length;
      summary.message = `Inserted ${summary.inserted} new products and updated ${summary.updated} existing products`;
      return res.json(summary);
    } catch (err) {
      const writeErrors = err?.writeErrors || [];
      summary.inserted = Math.max(0, toInsert.length - writeErrors.length);
      summary.errors = writeErrors.length;
      summary.message = `Inserted ${summary.inserted} new products and updated ${summary.updated} existing products (some duplicates skipped)`;
      return res.json(summary);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Dump sync failed" });
  }
};

exports.uploadSamsungProductTagsFromCsv = async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ message: "File is required" });
    }

    const originalname = String(req.file.originalname || "").toLowerCase();
    if (!originalname.endsWith(".csv")) {
      return res.status(400).json({ message: "Only CSV files are allowed" });
    }

    const dryRun = String(req.query.dryRun || "false").toLowerCase() === "true";
    const { headers, rows } = parseCsvRowsWithHeaders(req.file.buffer);

    if (!rows.length) {
      return res.status(400).json({ message: "Empty CSV file" });
    }

    const codeIndex = headers.findIndex(
      (header) => String(header || "").trim().toLowerCase() === "code"
    );
    const tagIndexes = headers.reduce((acc, header, index) => {
      if (String(header || "").trim().toLowerCase() === "tag") {
        acc.push(index);
      }
      return acc;
    }, []);

    if (codeIndex === -1) {
      return res.status(400).json({ message: "Missing required 'code' column" });
    }

    if (!tagIndexes.length) {
      return res.status(400).json({ message: "At least one 'tag' column is required" });
    }

    const normalizedRows = [];
    const invalidRows = [];

    rows.forEach((row, index) => {
      const rowNumber = index + 2;
      const code = cleanCode(row?.[codeIndex]);
      const tags = dedupeTagsCaseInsensitive(
        tagIndexes.map((tagIndex) => row?.[tagIndex])
      );

      if (!code) {
        invalidRows.push({
          rowNumber,
          code: null,
          reason: "Missing code",
        });
        return;
      }

      if (!tags.length) {
        invalidRows.push({
          rowNumber,
          code,
          reason: "No tags found in row",
        });
        return;
      }

      normalizedRows.push({
        rowNumber,
        code,
        tags,
      });
    });

    if (!normalizedRows.length) {
      return res.status(400).json({
        message: "No valid code/tag rows found in CSV",
        invalidRows,
      });
    }

    const fileMap = new Map();
    normalizedRows.forEach((row) => {
      const existing = fileMap.get(row.code);
      if (!existing) {
        fileMap.set(row.code, {
          code: row.code,
          rowNumbers: [row.rowNumber],
          tags: [...row.tags],
        });
        return;
      }

      existing.rowNumbers.push(row.rowNumber);
      existing.tags = dedupeTagsCaseInsensitive([...existing.tags, ...row.tags]);
    });

    const finalRows = Array.from(fileMap.values());
    const codes = finalRows.map((row) => row.code);

    const existingProducts = await Product.find(
      { brand: "samsung", product_code: { $in: codes } },
      {
        _id: 1,
        product_code: 1,
        product_name: 1,
        model_code: 1,
        tags: 1,
        status: 1,
      }
    ).lean();

    const productMap = new Map(
      existingProducts.map((product) => [cleanCode(product.product_code), product])
    );

    const changedProducts = [];
    const inactiveProducts = [];
    const notFoundProducts = [];
    const unchangedProducts = [];

    finalRows.forEach((row) => {
      const product = productMap.get(row.code);

      if (!product) {
        notFoundProducts.push({
          code: row.code,
          rowNumbers: row.rowNumbers,
        });
        return;
      }

      const existingTags = Array.isArray(product.tags)
        ? dedupeTagsCaseInsensitive(product.tags)
        : [];
      const existingTagSet = new Set(existingTags.map((tag) => normalizeTagKey(tag)));
      const newTags = row.tags.filter((tag) => !existingTagSet.has(normalizeTagKey(tag)));
      const finalTags = [...existingTags, ...newTags];

      if (String(product.status || "").toLowerCase() === "inactive") {
        inactiveProducts.push({
          code: row.code,
          product_name: product.product_name || "",
          status: product.status || "inactive",
          rowNumbers: row.rowNumbers,
        });
      }

      if (!newTags.length) {
        unchangedProducts.push({
          code: row.code,
          product_name: product.product_name || "",
          existingTags,
          requestedTags: row.tags,
          rowNumbers: row.rowNumbers,
        });
        return;
      }

      changedProducts.push({
        _id: product._id,
        code: row.code,
        product_name: product.product_name || "",
        model_code: product.model_code || "",
        existingTags,
        addedTags: newTags,
        finalTags,
        rowNumbers: row.rowNumbers,
        status: product.status || "",
      });
    });

    const summary = {
      success: true,
      dryRun,
      totalRows: rows.length,
      validRows: normalizedRows.length,
      invalidRows: invalidRows.length,
      uniqueCodesInFile: finalRows.length,
      foundInDb: finalRows.length - notFoundProducts.length,
      changed: changedProducts.length,
      updated: 0,
      unchanged: unchangedProducts.length,
      inactiveInList: inactiveProducts.length,
      notFoundInDb: notFoundProducts.length,
      totalNewTagsAdded: changedProducts.reduce(
        (count, item) => count + item.addedTags.length,
        0
      ),
      skippedRows: invalidRows,
      inactiveProducts,
      notFoundProducts,
      sampleChangedProducts: changedProducts.slice(0, 25).map((item) => ({
        code: item.code,
        product_name: item.product_name,
        model_code: item.model_code,
        existingTags: item.existingTags,
        addedTags: item.addedTags,
        finalTags: item.finalTags,
        status: item.status,
      })),
      sampleUnchangedProducts: unchangedProducts.slice(0, 25),
    };

    if (dryRun) {
      summary.message = "Dry run completed for product tag sync";
      return res.json(summary);
    }

    if (!changedProducts.length) {
      summary.message = "No product tags needed updating";
      return res.json(summary);
    }

    const bulkOps = changedProducts.map((item) => ({
      updateOne: {
        filter: { _id: item._id },
        update: {
          $addToSet: {
            tags: { $each: item.addedTags },
          },
        },
      },
    }));

    const bulkResult = await Product.bulkWrite(bulkOps, { ordered: false });
    summary.updated = bulkResult.modifiedCount || changedProducts.length;
    summary.message = `Updated tags for ${summary.updated} products`;

    return res.json(summary);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Product tag sync failed", error: err.message });
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

exports.uploadSamsungDumpHierarchy = async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ message: "File is required" });
    }

    const dryRun = String(req.query.dryRun || "false").toLowerCase() === "true";

    const rows = parseDumpFile(req.file.buffer, req.file.originalname);

    if (!rows.length) {
      return res.status(400).json({ message: "Empty file (parser returned 0 rows)" });
    }

    const hierarchyName = "default_sales_flow";

    // keep one row per dealer
    const dealerMap = new Map();

    for (const row of rows) {
      const buyerType = String(row["Buyer Type"] || "").trim().toLowerCase();
      const dealer = String(row["BuyerCode"] || "").trim();

      if (buyerType !== "dealer") continue;
      if (!dealer) continue;

      if (!dealerMap.has(dealer)) {
        dealerMap.set(dealer, row);
      }
    }

    const dealerCodes = Array.from(dealerMap.keys());

    if (!dealerCodes.length) {
      return res.status(400).json({ message: "No dealer rows found in file" });
    }

    // find already existing hierarchy entries
    const existingEntries = await HierarchyEntries.find(
      {
        hierarchy_name: hierarchyName,
        dealer: { $in: dealerCodes },
      },
      { dealer: 1 }
    ).lean();

    const existingDealerSet = new Set(
      existingEntries.map((item) => String(item.dealer || "").trim())
    );

    const normalize = (value) =>
      String(value || "")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();

    // collect names needed for actor lookup
    const asmNames = new Set();
    const zsmNames = new Set();

    for (const row of dealerMap.values()) {
      const asmName = String(row["ABM/RSO"] || row["ABM"] || "").trim();
      const zsmName = String(row["ZSM"] || "").trim();

      if (asmName) asmNames.add(asmName);
      if (zsmName) zsmNames.add(zsmName);
    }

    const allNames = Array.from(new Set([...asmNames, ...zsmNames]));

    const actorDocs = await ActorCode.find(
      {
        name: { $in: allNames },
      },
      {
        code: 1,
        name: 1,
        position: 1,
        role: 1,
      }
    ).lean();

    const actorMap = new Map();

    for (const actor of actorDocs) {
      const nameKey = normalize(actor.name);
      const posKey = normalize(actor.position || actor.role);
      actorMap.set(`${nameKey}__${posKey}`, actor);
    }

    const findActorCode = (name, positions = []) => {
      const nameKey = normalize(name);
      if (!nameKey) return "";

      for (const pos of positions) {
        const actor = actorMap.get(`${nameKey}__${normalize(pos)}`);
        if (actor?.code) return String(actor.code).trim();
      }

      return "";
    };

    const toInsert = [];

    for (const [dealer, row] of dealerMap.entries()) {
      if (existingDealerSet.has(dealer)) continue;

      const smd = String(row["SPD Code"] || "").trim() || "6434002";
      const mdd = String(row["MDD Code"] || "").trim();

      const asmName = String(row["ABM/RSO"] || row["ABM"] || "").trim();
      const zsmName = String(row["ZSM"] || "").trim();

      const asm = findActorCode(asmName, ["asm"]) || "";
      const zsm = findActorCode(zsmName, ["zsm"]) || "";

      toInsert.push({
        hierarchy_name: hierarchyName,
        smd,
        zsm,
        asm,
        mdd,
        tse: "",
        dealer,
      });
    }

    const summary = {
      success: true,
      dryRun,
      totalRows: rows.length,
      uniqueDealersInFile: dealerCodes.length,
      existingInHierarchy: existingDealerSet.size,
      toInsert: toInsert.length,
      inserted: 0,
      skipped: dealerCodes.length - toInsert.length,
      errors: 0,
    };

    if (dryRun) {
      return res.json({
        ...summary,
        sampleNewHierarchyEntries: toInsert.slice(0, 50),
      });
    }

    if (!toInsert.length) {
      return res.json({
        ...summary,
        message: "No new hierarchy entries to insert",
      });
    }

    try {
      const insertedDocs = await HierarchyEntries.insertMany(toInsert, {
        ordered: false,
      });

      summary.inserted = insertedDocs.length;
      summary.message = `Inserted ${summary.inserted} new hierarchy entries`;

      return res.json(summary);
    } catch (err) {
      const writeErrors = err?.writeErrors || [];
      summary.inserted = Math.max(0, toInsert.length - writeErrors.length);
      summary.errors = writeErrors.length;
      summary.message = `Inserted ${summary.inserted} new hierarchy entries (some duplicates/errors skipped)`;

      return res.json(summary);
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Hierarchy dump sync failed" });
  }
};



//////////////////////////////////////////
////////////////////////////////////
////////////////////////////////////////////////////

function parseCsvBuffer(buffer) {
  return new Promise((resolve, reject) => {
    const rows = [];

    Readable.from(buffer)
      .pipe(csv())
      .on("data", (data) => rows.push(data))
      .on("end", () => resolve(rows))
      .on("error", (err) => reject(err));
  });
}

function parseBoolean(value) {
  const v = String(value || "").trim().toLowerCase();

  if (["true", "1", "yes", "y"].includes(v)) return true;
  if (["false", "0", "no", "n"].includes(v)) return false;

  return null;
}

function getRowValue(row, possibleKeys = []) {
  for (const key of possibleKeys) {
    if (row[key] !== undefined && row[key] !== null) {
      return row[key];
    }
  }
  return "";
}


exports.uploadTopDealerFromCsv = async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ message: "File is required" });
    }

    const dryRun = String(req.query.dryRun || "false").toLowerCase() === "true";

    console.log("HAS FILE?", !!req.file);
    console.log("FILE SIZE:", req.file?.size);
    console.log("ORIGINAL:", req.file?.originalname);
    console.log("MIMETYPE:", req.file?.mimetype);
    console.log("FILE FIRST 8 BYTES HEX:", req.file.buffer.slice(0, 8).toString("hex"));
    console.log("FILE FIRST 20 CHARS:", req.file.buffer.slice(0, 20).toString());

    const originalname = String(req.file.originalname || "").toLowerCase();
    if (!originalname.endsWith(".csv")) {
      return res.status(400).json({ message: "Only CSV files are allowed" });
    }

    const rows = await parseCsvBuffer(req.file.buffer);

    console.log("PARSED ROW COUNT:", rows.length);
    if (rows.length) {
      console.log("FIRST ROW KEYS:", Object.keys(rows[0] || {}).slice(0, 20));
      console.log("FIRST 2 ROWS:", JSON.stringify(rows.slice(0, 2), null, 2));
    }

    if (!rows.length) {
      return res.status(400).json({ message: "Empty file (parser returned 0 rows)" });
    }

    const normalizedRows = [];
    const invalidRows = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {};

      const code = String(
        getRowValue(row, ["code", "Code", "CODE", "user_code", "UserCode", "User Code"])
      ).trim();

      const rawStatus = getRowValue(row, ["status", "Status", "STATUS"]);
      const parsedStatus = parseBoolean(rawStatus);

      if (!code || parsedStatus === null) {
        invalidRows.push({
          rowNumber: i + 2,
          code: code || null,
          status: rawStatus ?? null,
          reason: !code ? "Missing code" : "Invalid status value",
        });
        continue;
      }

      normalizedRows.push({
        rowNumber: i + 2,
        code,
        top_outlet: parsedStatus,
      });
    }

    if (!normalizedRows.length) {
      return res.status(400).json({
        message: "No valid code/status rows found in CSV",
        invalidRows,
      });
    }

    // dedupe by code, last one wins
    const map = new Map();
    for (const row of normalizedRows) {
      map.set(row.code, row);
    }

    const finalRows = Array.from(map.values());
    const uniqueCodes = finalRows.map((r) => r.code);

    if (!uniqueCodes.length) {
      return res.status(400).json({ message: "No valid codes found in file" });
    }

    const existingUsers = await User.find(
      { code: { $in: uniqueCodes } },
      { _id: 1, code: 1, name: 1, top_outlet: 1 }
    ).lean();

    const existingMap = new Map(
      existingUsers.map((u) => [String(u.code).trim(), u])
    );

    const toUpdate = [];
    const notFoundUsers = [];

    for (const row of finalRows) {
      const user = existingMap.get(row.code);

      if (!user) {
        notFoundUsers.push({
          rowNumber: row.rowNumber,
          code: row.code,
          reason: "User not found",
        });
        continue;
      }

      toUpdate.push({
        userId: user._id,
        code: row.code,
        name: user.name || "",
        top_outlet: row.top_outlet,
        oldValue:
          typeof user.top_outlet === "boolean" ? user.top_outlet : undefined,
      });
    }

    const summary = {
      success: true,
      dryRun,
      totalRows: rows.length,
      validRows: normalizedRows.length,
      uniqueCodesInFile: uniqueCodes.length,
      foundUsers: toUpdate.length,
      notFound: notFoundUsers.length,
      invalidRows: invalidRows.length,
      toUpdate: toUpdate.length,
      updated: 0,
      unchanged: 0,
      failed: 0,
      failedUsers: [],
      skippedUsers: [...invalidRows, ...notFoundUsers],
    };

    if (dryRun) {
      return res.json({
        ...summary,
        sampleUsers: toUpdate.slice(0, 20),
      });
    }

    if (!toUpdate.length) {
      return res.status(400).json({
        ...summary,
        message: "No matching users found to update",
      });
    }

    for (const item of toUpdate) {
      try {
        const result = await User.updateOne(
          { _id: item.userId },
          { $set: { top_outlet: item.top_outlet } }
        );

        if (result.modifiedCount > 0) {
          summary.updated += 1;
        } else {
          summary.unchanged += 1;
        }
      } catch (err) {
        summary.failed += 1;
        summary.failedUsers.push({
          code: item.code,
          name: item.name,
          top_outlet: item.top_outlet,
          reason: err.message || "Update failed",
        });
      }
    }

    summary.message = `Processed ${summary.uniqueCodesInFile} unique codes. Updated ${summary.updated}, unchanged ${summary.unchanged}, failed ${summary.failed}`;

    return res.json(summary);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Top dealer CSV sync failed" });
  }
};

exports.uploadExtractionActiveFromCsv = async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ message: "File is required" });
    }

    const dryRun = String(req.query.dryRun || "false").toLowerCase() === "true";

    console.log("HAS FILE?", !!req.file);
    console.log("FILE SIZE:", req.file?.size);
    console.log("ORIGINAL:", req.file?.originalname);
    console.log("MIMETYPE:", req.file?.mimetype);
    console.log("FILE FIRST 8 BYTES HEX:", req.file.buffer.slice(0, 8).toString("hex"));
    console.log("FILE FIRST 20 CHARS:", req.file.buffer.slice(0, 20).toString());

    const originalname = String(req.file.originalname || "").toLowerCase();
    if (!originalname.endsWith(".csv")) {
      return res.status(400).json({ message: "Only CSV files are allowed" });
    }

    const rows = await parseCsvBuffer(req.file.buffer);

    console.log("PARSED ROW COUNT:", rows.length);
    if (rows.length) {
      console.log("FIRST ROW KEYS:", Object.keys(rows[0] || {}).slice(0, 20));
      console.log("FIRST 2 ROWS:", JSON.stringify(rows.slice(0, 2), null, 2));
    }

    if (!rows.length) {
      return res.status(400).json({ message: "Empty file (parser returned 0 rows)" });
    }

    const normalizedRows = [];
    const invalidRows = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {};

      const code = String(
        getRowValue(row, ["code", "Code", "CODE", "user_code", "UserCode", "User Code"])
      ).trim();

      const rawStatus = getRowValue(row, [
        "extraction_active",
        "Extraction Active",
        "EXTRACTION_ACTIVE",
        "ExtractionActive",
        "status",
        "Status",
        "STATUS",
      ]);

      const parsedStatus = parseBoolean(rawStatus);

      if (!code || parsedStatus === null) {
        invalidRows.push({
          rowNumber: i + 2,
          code: code || null,
          extraction_active: rawStatus ?? null,
          reason: !code ? "Missing code" : "Invalid extraction_active value",
        });
        continue;
      }

      normalizedRows.push({
        rowNumber: i + 2,
        code,
        extraction_active: parsedStatus,
      });
    }

    if (!normalizedRows.length) {
      return res.status(400).json({
        message: "No valid code/extraction_active rows found in CSV",
        invalidRows,
      });
    }

    // dedupe by code, last one wins
    const map = new Map();
    for (const row of normalizedRows) {
      map.set(row.code, row);
    }

    const finalRows = Array.from(map.values());
    const uniqueCodes = finalRows.map((r) => r.code);

    if (!uniqueCodes.length) {
      return res.status(400).json({ message: "No valid codes found in file" });
    }

    const existingUsers = await User.find(
      { code: { $in: uniqueCodes } },
      { _id: 1, code: 1, name: 1, extraction_active: 1 }
    ).lean();

    const existingMap = new Map(
      existingUsers.map((u) => [String(u.code).trim(), u])
    );

    const toUpdate = [];
    const notFoundUsers = [];

    for (const row of finalRows) {
      const user = existingMap.get(row.code);

      if (!user) {
        notFoundUsers.push({
          rowNumber: row.rowNumber,
          code: row.code,
          reason: "User not found",
        });
        continue;
      }

      toUpdate.push({
        userId: user._id,
        code: row.code,
        name: user.name || "",
        extraction_active: row.extraction_active,
        oldValue:
          typeof user.extraction_active === "boolean"
            ? user.extraction_active
            : undefined,
      });
    }

    const summary = {
      success: true,
      dryRun,
      totalRows: rows.length,
      validRows: normalizedRows.length,
      uniqueCodesInFile: uniqueCodes.length,
      foundUsers: toUpdate.length,
      notFound: notFoundUsers.length,
      invalidRows: invalidRows.length,
      toUpdate: toUpdate.length,
      updated: 0,
      unchanged: 0,
      failed: 0,
      failedUsers: [],
      skippedUsers: [...invalidRows, ...notFoundUsers],
    };

    if (dryRun) {
      return res.json({
        ...summary,
        sampleUsers: toUpdate.slice(0, 20),
      });
    }

    if (!toUpdate.length) {
      return res.status(400).json({
        ...summary,
        message: "No matching users found to update",
      });
    }

    for (const item of toUpdate) {
      try {
        const result = await User.updateOne(
          { _id: item.userId },
          { $set: { extraction_active: item.extraction_active } }
        );

        if (result.modifiedCount > 0) {
          summary.updated += 1;
        } else {
          summary.unchanged += 1;
        }
      } catch (err) {
        summary.failed += 1;
        summary.failedUsers.push({
          code: item.code,
          name: item.name,
          extraction_active: item.extraction_active,
          reason: err.message || "Update failed",
        });
      }
    }

    summary.message = `Processed ${summary.uniqueCodesInFile} unique codes. Updated ${summary.updated}, unchanged ${summary.unchanged}, failed ${summary.failed}`;

    return res.json(summary);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Extraction active CSV sync failed" });
  }
};

exports.updateDealerCatgoryFromCSV = async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ message: "File is required" });
    }

    const dryRun = String(req.query.dryRun || "false").toLowerCase() === "true";

    console.log("HAS FILE?", !!req.file);
    console.log("FILE SIZE:", req.file?.size);
    console.log("ORIGINAL:", req.file?.originalname);
    console.log("MIMETYPE:", req.file?.mimetype);
    console.log("FILE FIRST 8 BYTES HEX:", req.file.buffer.slice(0, 8).toString("hex"));
    console.log("FILE FIRST 20 CHARS:", req.file.buffer.slice(0, 20).toString());

    const originalname = String(req.file.originalname || "").toLowerCase();
    if (!originalname.endsWith(".csv")) {
      return res.status(400).json({ message: "Only CSV files are allowed" });
    }

    const rows = await parseCsvBuffer(req.file.buffer);

    console.log("PARSED ROW COUNT:", rows.length);
    if (rows.length) {
      console.log("FIRST ROW KEYS:", Object.keys(rows[0] || {}).slice(0, 20));
      console.log("FIRST 2 ROWS:", JSON.stringify(rows.slice(0, 2), null, 2));
    }

    if (!rows.length) {
      return res.status(400).json({ message: "Empty file (parser returned 0 rows)" });
    }

    const normalizedRows = [];
    const invalidRows = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {};

      const code = String(
        getRowValue(row, ["code", "Code", "CODE", "user_code", "UserCode", "User Code"])
      ).trim();

      const category = String(
        getRowValue(row, ["category", "Category", "CATEGORY"])
      ).trim();

      if (!code || !category) {
        invalidRows.push({
          rowNumber: i + 2,
          code: code || null,
          category: category || null,
          reason: !code ? "Missing code" : "Missing category",
        });
        continue;
      }

      normalizedRows.push({
        rowNumber: i + 2,
        code,
        category,
      });
    }

    if (!normalizedRows.length) {
      return res.status(400).json({
        message: "No valid code/category rows found in CSV",
        invalidRows,
      });
    }

    // dedupe by code, last one wins
    const map = new Map();
    for (const row of normalizedRows) {
      map.set(row.code, row);
    }

    const finalRows = Array.from(map.values());
    const uniqueCodes = finalRows.map((r) => r.code);

    if (!uniqueCodes.length) {
      return res.status(400).json({ message: "No valid codes found in file" });
    }

    const existingUsers = await User.find(
      { code: { $in: uniqueCodes } },
      { _id: 1, code: 1, name: 1, category: 1 }
    ).lean();

    const existingMap = new Map(
      existingUsers.map((u) => [String(u.code).trim(), u])
    );

    const toUpdate = [];
    const notFoundUsers = [];

    for (const row of finalRows) {
      const user = existingMap.get(row.code);

      if (!user) {
        notFoundUsers.push({
          rowNumber: row.rowNumber,
          code: row.code,
          reason: "User not found",
        });
        continue;
      }

      toUpdate.push({
        userId: user._id,
        code: row.code,
        name: user.name || "",
        category: row.category,
        oldValue: user.category || undefined,
      });
    }

    const summary = {
      success: true,
      dryRun,
      totalRows: rows.length,
      validRows: normalizedRows.length,
      uniqueCodesInFile: uniqueCodes.length,
      foundUsers: toUpdate.length,
      notFound: notFoundUsers.length,
      invalidRows: invalidRows.length,
      toUpdate: toUpdate.length,
      updated: 0,
      unchanged: 0,
      failed: 0,
      failedUsers: [],
      skippedUsers: [...invalidRows, ...notFoundUsers],
    };

    if (dryRun) {
      return res.json({
        ...summary,
        sampleUsers: toUpdate.slice(0, 20),
      });
    }

    if (!toUpdate.length) {
      return res.status(400).json({
        ...summary,
        message: "No matching users found to update",
      });
    }

    for (const item of toUpdate) {
      try {
        const result = await User.updateOne(
          { _id: item.userId },
          { $set: { category: item.category } }
        );

        if (result.modifiedCount > 0) {
          summary.updated += 1;
        } else {
          summary.unchanged += 1;
        }
      } catch (err) {
        summary.failed += 1;
        summary.failedUsers.push({
          code: item.code,
          name: item.name,
          category: item.category,
          reason: err.message || "Update failed",
        });
      }
    }

    summary.message = `Processed ${summary.uniqueCodesInFile} unique codes. Updated ${summary.updated}, unchanged ${summary.unchanged}, failed ${summary.failed}`;

    return res.json(summary);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Dealer category CSV sync failed" });
  }
};
