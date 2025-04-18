const ActorCode = require("../../model/ActorCode");
const ActorTypesHierarchy = require("../../model/ActorTypesHierarchy");
const HierarchyEntries = require("../../model/HierarchyEntries");
const SalesData = require("../../model/SalesData");
const User = require("../../model/User");


exports.getSubordinatesByCode = async (req, res) => {
  try {
    console.log("Reaacchhhh");
    const { code, filter_type = "value", start_date, end_date } = req.body;

    if (!code || !start_date || !end_date) {
      return res.status(400).json({ success: false, message: "Code, start_date, and end_date are required." });
    }

    // Fetch actor details
    const actor = await ActorCode.findOne({ code });
    if (!actor) {
      return res.status(404).json({ success: false, message: "Actor not found." });
    }

    const { position } = actor;
    if (!position) {
      return res.status(400).json({ success: false, message: "Position not found for this user." });
    }

    // Fetch hierarchy from actorTypesHierarchy
    const actorHierarchy = await ActorTypesHierarchy.findOne({name: "default_sales_flow"});
    if (!actorHierarchy) {
      return res.status(500).json({ success: false, message: "Hierarchy data not found." });
    }

    // Extract allPositions dynamically
    const allPositions = actorHierarchy.hierarchy || [];
    const default_sales_flow = actorHierarchy.default_sales_flow;

    const userPositionIndex = allPositions.indexOf(position);
    if (userPositionIndex === -1 || userPositionIndex === allPositions.length - 1) {
      return res.status(200).json({ success: true, position: null, subordinates: {} });
    }

    // Get the immediate next subordinate position
    const nextSubordinatePosition = allPositions[userPositionIndex + 1];

    // Fetch hierarchy entries
    const hierarchyEntries = await HierarchyEntries.find({ [position]: code });
    if (!hierarchyEntries.length) {
      return res.status(200).json({ success: true, position: null, subordinates: {} });
    }

    // Collect subordinate codes
    let subordinateCodes = hierarchyEntries.map(entry => entry[nextSubordinatePosition]).filter(Boolean);
    if (!subordinateCodes.length) {
      return res.status(200).json({ success: true, position: nextSubordinatePosition, subordinates: {} });
    }

    // Fetch names for subordinate codes
    let subordinates = await ActorCode.find(
      { code: { $in: subordinateCodes } },
      { code: 1, name: 1, _id: 0 }
    );

    // Convert dates to IST
    const convertToIST = (date) => {
      let d = new Date(date);
      return new Date(d.getTime() + (5.5 * 60 * 60 * 1000)); // Convert UTC to IST
    };

    const startDate = convertToIST(new Date(start_date));
    const endDate = convertToIST(new Date(end_date));

    // Get last month’s start & end date
    let lmtdStartDate = new Date(startDate);
    lmtdStartDate.setMonth(lmtdStartDate.getMonth() - 1);
    let lmtdEndDate = new Date(endDate);
    lmtdEndDate.setMonth(lmtdEndDate.getMonth() - 1);

    // Fetch sales data for each subordinate
    let salesData = {};
    salesData[nextSubordinatePosition] = await Promise.all(
      subordinates.map(async (sub) => {
        let baseQuery = { buyer_code: sub.code };

        // Fetch MTD Sell Out
        let mtdSellOut = await SalesData.aggregate([
          { $match: { ...baseQuery, sales_type: "Sell Out", date: { $gte: startDate, $lte: endDate } } },
          { $group: { _id: null, total: { $sum: { $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}` } } } }
        ]);

        // Fetch LMTD Sell Out
        let lmtdSellOut = await SalesData.aggregate([
          { $match: { ...baseQuery, sales_type: "Sell Out", date: { $gte: lmtdStartDate, $lte: lmtdEndDate } } },
          { $group: { _id: null, total: { $sum: { $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}` } } } }
        ]);

        // Calculate Growth %
        const calculateGrowth = (current, last) => (last !== 0 ? ((current - last) / last) * 100 : 0);

        return {
          code: sub.code,
          name: sub.name,
          mtd_sell_out: mtdSellOut.length > 0 ? mtdSellOut[0].total : 0,
          lmtd_sell_out: lmtdSellOut.length > 0 ? lmtdSellOut[0].total : 0,
          sell_out_growth: calculateGrowth(
            mtdSellOut.length > 0 ? mtdSellOut[0].total : 0,
            lmtdSellOut.length > 0 ? lmtdSellOut[0].total : 0
          ).toFixed(2),
        };
      })
    );

    res.status(200).json({ success: true, position: nextSubordinatePosition, subordinates: salesData, default_sales_flow });

  } catch (error) {
    console.error("Error in getSubordinatesByCode:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};


// exports.getSubordinatesForUser = async (req, res) => {
//   try {
//     console.log("Subods reaching");
//     const { code } = req.user;
//     const { filter_type = "value", start_date, end_date, subordinate_codes = [] } = req.body;
//     console.log("Subordinate codes: ", subordinate_codes);

//     if (!code || !start_date || !end_date) {
//       return res.status(400).json({ success: false, message: "Code, start_date, and end_date are required." });
//     }

//     const actor = await ActorCode.findOne({ code });
//     if (!actor) return res.status(404).json({ success: false, message: "Actor not found." });
//     const { position } = actor;
//     if (!position) return res.status(400).json({ success: false, message: "Position not found for this user." });

//     const actorHierarchy = await ActorTypesHierarchy.findOne({ name: "default_sales_flow" });
//     if (!actorHierarchy || !actorHierarchy.hierarchy) {
//       return res.status(500).json({ success: false, message: "Hierarchy data not found." });
//     }

//     const allPositions = actorHierarchy.hierarchy;
//     const userPositionIndex = allPositions.indexOf(position);
//     if (userPositionIndex === -1 || userPositionIndex >= allPositions.length - 1) {
//       return res.status(200).json({ success: true, positions: [], subordinates: [] });
//     }

//     const subordinatePositions = allPositions.slice(userPositionIndex + 1);

//     let hierarchyEntries;
//     if (subordinate_codes.length > 0) {
//       const orFilters = allPositions.map(pos => ({ [pos]: { $in: subordinate_codes } }));
//       hierarchyEntries = await HierarchyEntries.find({ hierarchy_name: "default_sales_flow", $or: orFilters });
//     } else {
//       hierarchyEntries = await HierarchyEntries.find({ [position]: code });
//     }

//     const subordinates = [];
//     const allDealerCodesSet = new Set();
//     const addedSubordinateCodes = new Set();

//     for (const subPosition of subordinatePositions) {
//       const subCodes = [...new Set(hierarchyEntries.map(entry => entry[subPosition]).filter(Boolean))];
//       const subs = await ActorCode.find({ code: { $in: subCodes } }, { code: 1, name: 1, _id: 0 });

//       for (const sub of subs) {
//         if (addedSubordinateCodes.has(sub.code)) continue;
//         addedSubordinateCodes.add(sub.code);

//         const subHierarchyDealers = hierarchyEntries
//           .filter(entry => entry[subPosition] === sub.code && entry.dealer)
//           .map(entry => entry.dealer);

//         subHierarchyDealers.forEach(code => allDealerCodesSet.add(code));

//         if (subPosition === 'dealer') allDealerCodesSet.add(sub.code);

//         subordinates.push({
//           code: sub.code,
//           name: sub.name,
//           position: subPosition
//         });
//       }
//     }

//     const convertToIST = (date) => new Date(new Date(date).getTime() + 5.5 * 60 * 60 * 1000);
//     const startDate = convertToIST(start_date);
//     const endDate = convertToIST(end_date);
//     const lmtdStartDate = new Date(startDate); lmtdStartDate.setMonth(lmtdStartDate.getMonth() - 1);
//     const lmtdEndDate = new Date(endDate); lmtdEndDate.setMonth(lmtdEndDate.getMonth() - 1);

//     const allDealerCodes = [...allDealerCodesSet];

//     const mtdSales = await SalesData.aggregate([
//       { $match: { buyer_code: { $in: allDealerCodes }, sales_type: "Sell Out", date: { $gte: startDate, $lte: endDate } } },
//       { $group: { _id: "$buyer_code", total: { $sum: { $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}` } } } }
//     ]);

//     const lmtdSales = await SalesData.aggregate([
//       { $match: { buyer_code: { $in: allDealerCodes }, sales_type: "Sell Out", date: { $gte: lmtdStartDate, $lte: lmtdEndDate } } },
//       { $group: { _id: "$buyer_code", total: { $sum: { $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}` } } } }
//     ]);

//     const mtdMap = Object.fromEntries(mtdSales.map(e => [e._id, e.total]));
//     const lmtdMap = Object.fromEntries(lmtdSales.map(e => [e._id, e.total]));

//     const calculateGrowth = (current, last) => (last !== 0 ? ((current - last) / last) * 100 : 0);

//     subordinates.forEach(sub => {
//       const dealerCodes = hierarchyEntries
//         .filter(entry => entry[sub.position] === sub.code && entry.dealer)
//         .map(entry => entry.dealer);

//       if (sub.position === 'dealer') dealerCodes.push(sub.code);

//       let mtd = 0, lmtd = 0;
//       dealerCodes.forEach(code => {
//         mtd += mtdMap[code] || 0;
//         lmtd += lmtdMap[code] || 0;
//       });

//       sub.mtd_sell_out = mtd;
//       sub.lmtd_sell_out = lmtd;
//       sub.sell_out_growth = calculateGrowth(mtd, lmtd).toFixed(2);
//     });

//     const profileDealers = await User.find({ role: "dealer" }, { code: 1, taluka: 1, district: 1, zone: 1, labels: 1 });

//     const fieldGroups = { taluka: {}, district: {}, zone: {}, dealer_category: {} };

//     profileDealers.forEach(dealer => {
//       for (const key of ["taluka", "district", "zone"]) {
//         const val = dealer[key];
//         if (val) (fieldGroups[key][val] = fieldGroups[key][val] || []).push(dealer.code);
//       }
//       if (Array.isArray(dealer.labels)) {
//         dealer.labels.forEach(label => {
//           if (label) (fieldGroups.dealer_category[label] = fieldGroups.dealer_category[label] || []).push(dealer.code);
//         });
//       }
//     });

//     for (const [field, groupMap] of Object.entries(fieldGroups)) {
//       for (const [group, codes] of Object.entries(groupMap)) {
//         let mtd = 0, lmtd = 0;
//         codes.forEach(code => {
//           mtd += mtdMap[code] || 0;
//           lmtd += lmtdMap[code] || 0;
//         });
//         subordinates.push({
//           code: group,
//           name: group,
//           position: field,
//           mtd_sell_out: mtd,
//           lmtd_sell_out: lmtd,
//           sell_out_growth: calculateGrowth(mtd, lmtd).toFixed(2)
//         });
//       }
//     }

//     const finalPositions = [...new Set([...subordinatePositions, "taluka", "district", "zone", "dealer_category"])]
//     res.status(200).json({ success: true, positions: finalPositions, subordinates });

//   } catch (error) {
//     console.error("Error in getSubordinatesForUser:", error);
//     res.status(500).json({ success: false, message: "Internal server error" });
//   }
// };

exports.getSubordinatesForUser = async (req, res) => {
  try {
    console.log("Subods reaching");
    const { code } = req.user;
    const { filter_type = "value", start_date, end_date, subordinate_codes = [] } = req.body;
    console.log("Subordinate: ", subordinate_codes);

    if (!code || !start_date || !end_date) {
      return res.status(400).json({ success: false, message: "Code, start_date, and end_date are required." });
    }

    const actor = await ActorCode.findOne({ code });
    if (!actor) return res.status(404).json({ success: false, message: "Actor not found." });
    const { position } = actor;
    if (!position) return res.status(400).json({ success: false, message: "Position not found for this user." });

    const actorHierarchy = await ActorTypesHierarchy.findOne({ name: "default_sales_flow" });
    if (!actorHierarchy || !actorHierarchy.hierarchy) {
      return res.status(500).json({ success: false, message: "Hierarchy data not found." });
    }

    const allPositions = actorHierarchy.hierarchy;
    const userPositionIndex = allPositions.indexOf(position);
    if (userPositionIndex === -1 || userPositionIndex >= allPositions.length - 1) {
      return res.status(200).json({ success: true, positions: [], subordinates: [] });
    }

    const subordinatePositions = allPositions.slice(userPositionIndex + 1);

    let hierarchyEntries = [];
    if (subordinate_codes.length > 0) {
      hierarchyEntries = await HierarchyEntries.find({
        hierarchy_name: "default_sales_flow",
        $and: subordinate_codes.map(code => ({ $or: allPositions.map(pos => ({ [pos]: code })) }))
      });
    } else {
      hierarchyEntries = await HierarchyEntries.find({ [position]: code });
    }

    const subordinates = [];
    const allDealerCodesSet = new Set();
    const addedSubordinateCodes = new Set();

    for (const subPosition of subordinatePositions) {
      const filteredEntries = hierarchyEntries.filter(entry => entry[subPosition]);
      const subCodes = [...new Set(filteredEntries.map(entry => entry[subPosition]).filter(code => code && !addedSubordinateCodes.has(code)))];
      const subs = await ActorCode.find({ code: { $in: subCodes } }, { code: 1, name: 1, _id: 0 });

      for (const sub of subs) {
        addedSubordinateCodes.add(sub.code);

        const subHierarchyDealers = filteredEntries
          .filter(entry => entry[subPosition] === sub.code && entry.dealer)
          .map(entry => entry.dealer);

        subHierarchyDealers.forEach(code => allDealerCodesSet.add(code));
        if (subPosition === 'dealer') allDealerCodesSet.add(sub.code);

        subordinates.push({
          code: sub.code,
          name: sub.name,
          position: subPosition
        });
      }
    }

    const convertToIST = (date) => new Date(new Date(date).getTime() + 5.5 * 60 * 60 * 1000);
    const startDate = convertToIST(start_date);
    const endDate = convertToIST(end_date);
    const lmtdStartDate = new Date(startDate); lmtdStartDate.setMonth(lmtdStartDate.getMonth() - 1);
    const lmtdEndDate = new Date(endDate); lmtdEndDate.setMonth(lmtdEndDate.getMonth() - 1);

    const allDealerCodes = [...allDealerCodesSet];

    const mtdSales = await SalesData.aggregate([
      { $match: { buyer_code: { $in: allDealerCodes }, sales_type: "Sell Out", date: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: "$buyer_code", total: { $sum: { $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}` } } } }
    ]);

    const lmtdSales = await SalesData.aggregate([
      { $match: { buyer_code: { $in: allDealerCodes }, sales_type: "Sell Out", date: { $gte: lmtdStartDate, $lte: lmtdEndDate } } },
      { $group: { _id: "$buyer_code", total: { $sum: { $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}` } } } }
    ]);

    const mtdMap = Object.fromEntries(mtdSales.map(e => [e._id, e.total]));
    const lmtdMap = Object.fromEntries(lmtdSales.map(e => [e._id, e.total]));

    const calculateGrowth = (current, last) => (last !== 0 ? ((current - last) / last) * 100 : 0);

    subordinates.forEach(sub => {
      const dealerCodes = hierarchyEntries
        .filter(entry => entry[sub.position] === sub.code && entry.dealer)
        .map(entry => entry.dealer);

      if (sub.position === 'dealer') dealerCodes.push(sub.code);

      let mtd = 0, lmtd = 0;
      dealerCodes.forEach(code => {
        mtd += mtdMap[code] || 0;
        lmtd += lmtdMap[code] || 0;
      });

      sub.mtd_sell_out = mtd;
      sub.lmtd_sell_out = lmtd;
      sub.sell_out_growth = calculateGrowth(mtd, lmtd).toFixed(2);
    });

    const profileDealers = await User.find({ role: "dealer" }, { code: 1, taluka: 1, district: 1, zone: 1, labels: 1 });

    const fieldGroups = { taluka: {}, district: {}, zone: {}, dealer_category: {} };

    profileDealers.forEach(dealer => {
      for (const key of ["taluka", "district", "zone"]) {
        const val = dealer[key];
        if (val) (fieldGroups[key][val] = fieldGroups[key][val] || []).push(dealer.code);
      }
      if (Array.isArray(dealer.labels)) {
        dealer.labels.forEach(label => {
          if (label) (fieldGroups.dealer_category[label] = fieldGroups.dealer_category[label] || []).push(dealer.code);
        });
      }
    });

    for (const [field, groupMap] of Object.entries(fieldGroups)) {
      for (const [group, codes] of Object.entries(groupMap)) {
        let mtd = 0, lmtd = 0;
        codes.forEach(code => {
          mtd += mtdMap[code] || 0;
          lmtd += lmtdMap[code] || 0;
        });
        subordinates.push({
          code: group,
          name: group,
          position: field,
          mtd_sell_out: mtd,
          lmtd_sell_out: lmtd,
          sell_out_growth: calculateGrowth(mtd, lmtd).toFixed(2)
        });
      }
    }

    const finalPositions = [...new Set([...subordinatePositions, "taluka", "district", "zone", "dealer_category"])]
    res.status(200).json({ success: true, positions: finalPositions, subordinates });

  } catch (error) {
    console.error("Error in getSubordinatesForUser:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};




exports.getDealersForUser = async (req, res) => {
  try {
    const { code } = req.user;

    if (!code) {
      return res.status(400).json({ success: false, message: "User code is required." });
    }

    // Find the user in ActorCode
    const actor = await ActorCode.findOne({ code });
    if (!actor) {
      return res.status(404).json({ success: false, message: "Actor not found." });
    }

    const { position } = actor;
    if (!position) {
      return res.status(400).json({ success: false, message: "Position not found for this user." });
    }

    // Load hierarchy structure
    const actorHierarchy = await ActorTypesHierarchy.findOne({ name: "default_sales_flow" });
    if (!actorHierarchy || !actorHierarchy.hierarchy) {
      return res.status(500).json({ success: false, message: "Hierarchy data not found." });
    }

    const allPositions = actorHierarchy.hierarchy;
    const userPositionIndex = allPositions.indexOf(position);

    if (userPositionIndex === -1 || userPositionIndex >= allPositions.length - 1) {
      return res.status(200).json({ success: true, dealers: [] });
    }

    // Get all subordinates in hierarchy entries
    const hierarchyEntries = await HierarchyEntries.find({ [position]: code });
    if (!hierarchyEntries.length) {
      return res.status(200).json({ success: true, dealers: [] });
    }

    // Get the 'dealer' position
    const dealerPosition = "dealer";
    if (!allPositions.includes(dealerPosition)) {
      return res.status(200).json({ success: true, dealers: [] });
    }

    // Get all dealer codes from the hierarchy
    let dealerCodes = hierarchyEntries.map(entry => entry[dealerPosition]).filter(Boolean);
    dealerCodes = [...new Set(dealerCodes)]; // Remove duplicates

    // Fetch only code and name of those dealers
    const dealers = await ActorCode.find(
      { code: { $in: dealerCodes } },
      { code: 1, name: 1, _id: 0 }
    );

    return res.status(200).json({ success: true, dealers });

  } catch (error) {
    console.error("Error in getDealersForUser:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};
