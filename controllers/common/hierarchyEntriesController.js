const ActorCode = require("../../model/ActorCode");
const ActorTypesHierarchy = require("../../model/ActorTypesHierarchy");
const HierarchyEntries = require("../../model/HierarchyEntries");
const SalesData = require("../../model/SalesData");


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
//     const {code} = req.user;
//     const { filter_type = "value", start_date, end_date } = req.body;

//     if (!code || !start_date || !end_date) {
//       return res.status(400).json({ success: false, message: "Code, start_date, and end_date are required." });
//     }

//     // Fetch actor details
//     const actor = await ActorCode.findOne({ code });
//     if (!actor) {
//       return res.status(404).json({ success: false, message: "Actor not found." });
//     }

//     const { position } = actor;
//     if (!position) {
//       return res.status(400).json({ success: false, message: "Position not found for this user." });
//     }

//     // Fetch hierarchy from actorTypesHierarchy
//     const actorHierarchy = await ActorTypesHierarchy.findOne({name: "default_sales_flow"});
//     if (!actorHierarchy) {
//       return res.status(500).json({ success: false, message: "Hierarchy data not found." });
//     }

//     // Extract allPositions dynamically
//     const allPositions = actorHierarchy.hierarchy || [];
//     const default_sales_flow = actorHierarchy.default_sales_flow;

//     const userPositionIndex = allPositions.indexOf(position);
//     if (userPositionIndex === -1 || userPositionIndex === allPositions.length - 1) {
//       return res.status(200).json({ success: true, position: null, subordinates: {} });
//     }

//     // Get the immediate next subordinate position
//     const nextSubordinatePosition = allPositions[userPositionIndex + 1];

//     // Fetch hierarchy entries
//     const hierarchyEntries = await HierarchyEntries.find({ [position]: code });
//     if (!hierarchyEntries.length) {
//       return res.status(200).json({ success: true, position: null, subordinates: {} });
//     }

//     // Collect subordinate codes
//     let subordinateCodes = hierarchyEntries.map(entry => entry[nextSubordinatePosition]).filter(Boolean);
//     if (!subordinateCodes.length) {
//       return res.status(200).json({ success: true, position: nextSubordinatePosition, subordinates: {} });
//     }

//     // Fetch names for subordinate codes
//     let subordinates = await ActorCode.find(
//       { code: { $in: subordinateCodes } },
//       { code: 1, name: 1, _id: 0 }
//     );

//     // Convert dates to IST
//     const convertToIST = (date) => {
//       let d = new Date(date);
//       return new Date(d.getTime() + (5.5 * 60 * 60 * 1000)); // Convert UTC to IST
//     };

//     const startDate = convertToIST(new Date(start_date));
//     const endDate = convertToIST(new Date(end_date));

//     // Get last month’s start & end date
//     let lmtdStartDate = new Date(startDate);
//     lmtdStartDate.setMonth(lmtdStartDate.getMonth() - 1);
//     let lmtdEndDate = new Date(endDate);
//     lmtdEndDate.setMonth(lmtdEndDate.getMonth() - 1);

//     // Fetch sales data for each subordinate
//     let salesData = {};
//     salesData[nextSubordinatePosition] = await Promise.all(
//       subordinates.map(async (sub) => {
//         let baseQuery = { buyer_code: sub.code };

//         // Fetch MTD Sell Out
//         let mtdSellOut = await SalesData.aggregate([
//           { $match: { ...baseQuery, sales_type: "Sell Out", date: { $gte: startDate, $lte: endDate } } },
//           { $group: { _id: null, total: { $sum: { $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}` } } } }
//         ]);

//         // Fetch LMTD Sell Out
//         let lmtdSellOut = await SalesData.aggregate([
//           { $match: { ...baseQuery, sales_type: "Sell Out", date: { $gte: lmtdStartDate, $lte: lmtdEndDate } } },
//           { $group: { _id: null, total: { $sum: { $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}` } } } }
//         ]);

//         // Calculate Growth %
//         const calculateGrowth = (current, last) => (last !== 0 ? ((current - last) / last) * 100 : 0);

//         return {
//           code: sub.code,
//           name: sub.name,
//           mtd_sell_out: mtdSellOut.length > 0 ? mtdSellOut[0].total : 0,
//           lmtd_sell_out: lmtdSellOut.length > 0 ? lmtdSellOut[0].total : 0,
//           sell_out_growth: calculateGrowth(
//             mtdSellOut.length > 0 ? mtdSellOut[0].total : 0,
//             lmtdSellOut.length > 0 ? lmtdSellOut[0].total : 0
//           ).toFixed(2),
//         };
//       })
//     );

//     res.status(200).json({ success: true, position: nextSubordinatePosition, subordinates: salesData, default_sales_flow });

//   } catch (error) {
//     console.error("Error in getSubordinatesByCode:", error);
//     res.status(500).json({ success: false, message: "Internal server error" });
//   }
// };


exports.getSubordinatesForUser = async (req, res) => {
  try {
    console.log("Subods reaching");
    const { code } = req.user;
    const { filter_type = "value", start_date, end_date } = req.body;

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

    // Fetch hierarchy from ActorTypesHierarchy
    const actorHierarchy = await ActorTypesHierarchy.findOne({ name: "default_sales_flow" });
    if (!actorHierarchy || !actorHierarchy.hierarchy) {
      return res.status(500).json({ success: false, message: "Hierarchy data not found." });
    }

    const allPositions = actorHierarchy.hierarchy; // Full hierarchy array

    // Get user position index
    const userPositionIndex = allPositions.indexOf(position);
    if (userPositionIndex === -1 || userPositionIndex >= allPositions.length - 1) {
      return res.status(200).json({ success: true, positions: [], subordinates: [] });
    }

    // Extract only subordinate positions
    const subordinatePositions = allPositions.slice(userPositionIndex + 1);

    // Fetch hierarchy entries to get subordinates
    const hierarchyEntries = await HierarchyEntries.find({ [position]: code });
    if (!hierarchyEntries.length) {
      return res.status(200).json({ success: true, positions: subordinatePositions, subordinates: [] });
    }

    let subordinates = [];

    // Process each subordinate position
    for (const subPosition of subordinatePositions) {
      let subCodes = hierarchyEntries.map(entry => entry[subPosition]).filter(Boolean);
      if (!subCodes.length) continue;

      let subs = await ActorCode.find({ code: { $in: subCodes } }, { code: 1, name: 1, _id: 0 });

      for (let sub of subs) {
        let hierarchyMap = {};
        let subIndex = allPositions.indexOf(subPosition);

        // Attach all higher hierarchy positions between user and subordinate
        for (let i = userPositionIndex + 1; i < subIndex; i++) {
          let higherPosition = allPositions[i];
          let higherEntry = hierarchyEntries.find(entry => entry[subPosition] === sub.code);
          if (higherEntry) {
            hierarchyMap[higherPosition] = higherEntry[higherPosition] || null;
          }
        }

        subordinates.push({
          code: sub.code,
          name: sub.name,
          position: subPosition,
          ...hierarchyMap
        });
      }
    }

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
    await Promise.all(
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

        sub.mtd_sell_out = mtdSellOut.length > 0 ? mtdSellOut[0].total : 0;
        sub.lmtd_sell_out = lmtdSellOut.length > 0 ? lmtdSellOut[0].total : 0;
        sub.sell_out_growth = calculateGrowth(sub.mtd_sell_out, sub.lmtd_sell_out).toFixed(2);
      })
    );

    res.status(200).json({ success: true, positions: subordinatePositions, subordinates });

  } catch (error) {
    console.error("Error in getSubordinatesForUser:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

