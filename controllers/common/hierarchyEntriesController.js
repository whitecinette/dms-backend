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


// exports.getSubordinatesForUser = async (req, res) => {
//   try {
//     console.log("Subods reaching");
//     const { code } = req.user;
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

//     // Fetch hierarchy from ActorTypesHierarchy
//     const actorHierarchy = await ActorTypesHierarchy.findOne({ name: "default_sales_flow" });
//     if (!actorHierarchy || !actorHierarchy.hierarchy) {
//       return res.status(500).json({ success: false, message: "Hierarchy data not found." });
//     }

//     const allPositions = actorHierarchy.hierarchy; // Full hierarchy array

//     // Get user position index
//     const userPositionIndex = allPositions.indexOf(position);
//     if (userPositionIndex === -1 || userPositionIndex >= allPositions.length - 1) {
//       return res.status(200).json({ success: true, positions: [], subordinates: [] });
//     }

//     // Extract only subordinate positions
//     const subordinatePositions = allPositions.slice(userPositionIndex + 1);

//     // Fetch hierarchy entries to get subordinates
//     const hierarchyEntries = await HierarchyEntries.find({ [position]: code });
//     if (!hierarchyEntries.length) {
//       return res.status(200).json({ success: true, positions: subordinatePositions, subordinates: [] });
//     }

//     let subordinates = [];

//     // Process each subordinate position
//     for (const subPosition of subordinatePositions) {
//       let subCodes = hierarchyEntries.map(entry => entry[subPosition]).filter(Boolean);
//       if (!subCodes.length) continue;

//       let subs = await ActorCode.find({ code: { $in: subCodes } }, { code: 1, name: 1, _id: 0 });

//       for (let sub of subs) {
//         let hierarchyMap = {};
//         let subIndex = allPositions.indexOf(subPosition);

//         // Attach all higher hierarchy positions between user and subordinate
//         for (let i = userPositionIndex + 1; i < subIndex; i++) {
//           let higherPosition = allPositions[i];
//           let higherEntry = hierarchyEntries.find(entry => entry[subPosition] === sub.code);
//           if (higherEntry) {
//             hierarchyMap[higherPosition] = higherEntry[higherPosition] || null;
//           }
//         }

//         subordinates.push({
//           code: sub.code,
//           name: sub.name,
//           position: subPosition,
//           ...hierarchyMap
//         });
//       }
//     }

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
//     await Promise.all(
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

//         sub.mtd_sell_out = mtdSellOut.length > 0 ? mtdSellOut[0].total : 0;
//         sub.lmtd_sell_out = lmtdSellOut.length > 0 ? lmtdSellOut[0].total : 0;
//         sub.sell_out_growth = calculateGrowth(sub.mtd_sell_out, sub.lmtd_sell_out).toFixed(2);
//       })
//     );

//     res.status(200).json({ success: true, positions: subordinatePositions, subordinates });

//   } catch (error) {
//     console.error("Error in getSubordinatesForUser:", error);
//     res.status(500).json({ success: false, message: "Internal server error" });
//   }
// };

// exports.getSubordinatesForUser = async (req, res) => {
//   try {
//     console.log("Subods reaching");
//     const { code } = req.user;
//     const { filter_type = "value", start_date, end_date } = req.body;

//     if (!code || !start_date || !end_date) {
//       return res.status(400).json({ success: false, message: "Code, start_date, and end_date are required." });
//     }

//     const actor = await ActorCode.findOne({ code });
//     if (!actor) {
//       return res.status(404).json({ success: false, message: "Actor not found." });
//     }

//     const { position } = actor;
//     if (!position) {
//       return res.status(400).json({ success: false, message: "Position not found for this user." });
//     }

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
//     const hierarchyEntries = await HierarchyEntries.find({ [position]: code });
//     if (!hierarchyEntries.length) {
//       return res.status(200).json({ success: true, positions: subordinatePositions, subordinates: [] });
//     }

//     let subordinates = [];

//     for (const subPosition of subordinatePositions) {
//       let subCodes = hierarchyEntries.map(entry => entry[subPosition]).filter(Boolean);
//       if (!subCodes.length) continue;

//       let subs = await ActorCode.find({ code: { $in: subCodes } }, { code: 1, name: 1, _id: 0 });

//       for (let sub of subs) {
//         let hierarchyMap = {};
//         let subIndex = allPositions.indexOf(subPosition);

//         for (let i = userPositionIndex + 1; i < subIndex; i++) {
//           let higherPosition = allPositions[i];
//           let higherEntry = hierarchyEntries.find(entry => entry[subPosition] === sub.code);
//           if (higherEntry) {
//             hierarchyMap[higherPosition] = higherEntry[higherPosition] || null;
//           }
//         }

//         subordinates.push({
//           code: sub.code,
//           name: sub.name,
//           position: subPosition,
//           ...hierarchyMap
//         });
//       }
//     }

//     const convertToIST = (date) => {
//       let d = new Date(date);
//       return new Date(d.getTime() + (5.5 * 60 * 60 * 1000));
//     };

//     const startDate = convertToIST(new Date(start_date));
//     const endDate = convertToIST(new Date(end_date));

//     let lmtdStartDate = new Date(startDate);
//     lmtdStartDate.setMonth(lmtdStartDate.getMonth() - 1);
//     let lmtdEndDate = new Date(endDate);
//     lmtdEndDate.setMonth(lmtdEndDate.getMonth() - 1);

//     await Promise.all(
//       subordinates.map(async (sub) => {
//         let baseQuery = { buyer_code: sub.code };

//         let mtdSellOut = await SalesData.aggregate([
//           { $match: { ...baseQuery, sales_type: "Sell Out", date: { $gte: startDate, $lte: endDate } } },
//           { $group: { _id: null, total: { $sum: { $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}` } } } }
//         ]);

//         let lmtdSellOut = await SalesData.aggregate([
//           { $match: { ...baseQuery, sales_type: "Sell Out", date: { $gte: lmtdStartDate, $lte: lmtdEndDate } } },
//           { $group: { _id: null, total: { $sum: { $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}` } } } }
//         ]);

//         const calculateGrowth = (current, last) => (last !== 0 ? ((current - last) / last) * 100 : 0);

//         sub.mtd_sell_out = mtdSellOut.length > 0 ? mtdSellOut[0].total : 0;
//         sub.lmtd_sell_out = lmtdSellOut.length > 0 ? lmtdSellOut[0].total : 0;
//         sub.sell_out_growth = calculateGrowth(sub.mtd_sell_out, sub.lmtd_sell_out).toFixed(2);
//       })
//     );

//     // Independent grouping for taluka, district, zone (not in hierarchy)
//     const uniqueDealers = await User.find(
//       { role: "dealer" },
//       { code: 1, name: 1, taluka: 1, district: 1, zone: 1 }
//     );
    

//     const groupByField = async (fieldName, positionLabel) => {
//       const allUniqueGroups = await User.distinct(fieldName, { role: "dealer" });

//       console.log("Unique grpa:". allUniqueGroups);

//       for (let groupValue of allUniqueGroups) {
//         console.log("GroupValue: ", groupValue);
//         const dealerCodes = uniqueDealers
//         .filter(d => d[fieldName] === groupValue)
//         .map(d => d.code);

//         console.log("Delars for talike: ", dealerCodes);


//         let mtdValue = 0;
//         let lmtdValue = 0;

//         if (dealerCodes.length) {
//           const mtd = await SalesData.aggregate([
//             {
//               $match: {
//                 buyer_code: { $in: dealerCodes },
//                 sales_type: "Sell Out",
//                 date: { $gte: startDate, $lte: endDate },
//               },
//             },
//             {
//               $group: {
//                 _id: null,
//                 total: {
//                   $sum: {
//                     $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}`,
//                   },
//                 },
//               },
//             },
//           ]);

//           const lmtd = await SalesData.aggregate([
//             {
//               $match: {
//                 buyer_code: { $in: dealerCodes },
//                 sales_type: "Sell Out",
//                 date: { $gte: lmtdStartDate, $lte: lmtdEndDate },
//               },
//             },
//             {
//               $group: {
//                 _id: null,
//                 total: {
//                   $sum: {
//                     $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}`,
//                   },
//                 },
//               },
//             },
//           ]);

//           mtdValue = mtd.length ? mtd[0].total : 0;
//           lmtdValue = lmtd.length ? lmtd[0].total : 0;
//         }

//         const growth = lmtdValue !== 0 ? ((mtdValue - lmtdValue) / lmtdValue) * 100 : 0;

//         subordinates.push({
//           code: groupValue || positionLabel,
//           name: groupValue || positionLabel,
//           position: positionLabel,
//           mtd_sell_out: mtdValue,
//           lmtd_sell_out: lmtdValue,
//           sell_out_growth: growth.toFixed(2),
//         });
//       }
//     };

//     await groupByField("taluka", "taluka");
//     await groupByField("district", "district");
//     await groupByField("zone", "zone");

//     const finalPositions = [...new Set([...subordinatePositions, "taluka", "district", "zone"])];

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
    const { filter_type = "value", start_date, end_date } = req.body;

    if (!code || !start_date || !end_date) {
      return res.status(400).json({ success: false, message: "Code, start_date, and end_date are required." });
    }

    const actor = await ActorCode.findOne({ code });
    if (!actor) {
      return res.status(404).json({ success: false, message: "Actor not found." });
    }

    const { position } = actor;
    if (!position) {
      return res.status(400).json({ success: false, message: "Position not found for this user." });
    }

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
    const hierarchyEntries = await HierarchyEntries.find({ [position]: code });
    if (!hierarchyEntries.length) {
      return res.status(200).json({ success: true, positions: subordinatePositions, subordinates: [] });
    }

    let subordinates = [];

    for (const subPosition of subordinatePositions) {
      let subCodes = hierarchyEntries.map(entry => entry[subPosition]).filter(Boolean);
      if (!subCodes.length) continue;

      let subs = await ActorCode.find({ code: { $in: subCodes } }, { code: 1, name: 1, _id: 0 });

      for (let sub of subs) {
        let hierarchyMap = {};
        let subIndex = allPositions.indexOf(subPosition);

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

    const convertToIST = (date) => {
      let d = new Date(date);
      return new Date(d.getTime() + (5.5 * 60 * 60 * 1000));
    };

    const startDate = convertToIST(new Date(start_date));
    const endDate = convertToIST(new Date(end_date));

    let lmtdStartDate = new Date(startDate);
    lmtdStartDate.setMonth(lmtdStartDate.getMonth() - 1);
    let lmtdEndDate = new Date(endDate);
    lmtdEndDate.setMonth(lmtdEndDate.getMonth() - 1);

    // Unique dealer codes for grouping by subordinates
    await Promise.all(
      subordinates.map(async (sub) => {
        let dealerCodes = [];

        if (sub.position === 'dealer') {
          dealerCodes = [sub.code];
        } else {
          dealerCodes = hierarchyEntries
            .filter(entry => entry[sub.position] === sub.code && entry.dealer)
            .map(entry => entry.dealer);
        }

        dealerCodes = [...new Set(dealerCodes)];

        let mtdSellOut = await SalesData.aggregate([
          { $match: { buyer_code: { $in: dealerCodes }, sales_type: "Sell Out", date: { $gte: startDate, $lte: endDate } } },
          { $group: { _id: null, total: { $sum: { $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}` } } } }
        ]);

        let lmtdSellOut = await SalesData.aggregate([
          { $match: { buyer_code: { $in: dealerCodes }, sales_type: "Sell Out", date: { $gte: lmtdStartDate, $lte: lmtdEndDate } } },
          { $group: { _id: null, total: { $sum: { $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}` } } } }
        ]);

        const calculateGrowth = (current, last) => (last !== 0 ? ((current - last) / last) * 100 : 0);

        sub.mtd_sell_out = mtdSellOut.length > 0 ? mtdSellOut[0].total : 0;
        sub.lmtd_sell_out = lmtdSellOut.length > 0 ? lmtdSellOut[0].total : 0;
        sub.sell_out_growth = calculateGrowth(sub.mtd_sell_out, sub.lmtd_sell_out).toFixed(2);
      })
    );

    const uniqueDealers = await User.find(
      { role: "dealer" },
      { code: 1, name: 1, taluka: 1, district: 1, zone: 1 }
    );

    const groupByField = async (fieldName, positionLabel) => {
      const allUniqueGroups = await User.distinct(fieldName, { role: "dealer" });

      for (let groupValue of allUniqueGroups) {
        const dealerCodes = uniqueDealers
          .filter(d => d[fieldName] === groupValue)
          .map(d => d.code);

        let mtdValue = 0;
        let lmtdValue = 0;

        if (dealerCodes.length) {
          const mtd = await SalesData.aggregate([
            {
              $match: {
                buyer_code: { $in: dealerCodes },
                sales_type: "Sell Out",
                date: { $gte: startDate, $lte: endDate },
              },
            },
            {
              $group: {
                _id: null,
                total: {
                  $sum: {
                    $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}`,
                  },
                },
              },
            },
          ]);

          const lmtd = await SalesData.aggregate([
            {
              $match: {
                buyer_code: { $in: dealerCodes },
                sales_type: "Sell Out",
                date: { $gte: lmtdStartDate, $lte: lmtdEndDate },
              },
            },
            {
              $group: {
                _id: null,
                total: {
                  $sum: {
                    $toDouble: `$${filter_type === "value" ? "total_amount" : "quantity"}`,
                  },
                },
              },
            },
          ]);

          mtdValue = mtd.length ? mtd[0].total : 0;
          lmtdValue = lmtd.length ? lmtd[0].total : 0;
        }

        const growth = lmtdValue !== 0 ? ((mtdValue - lmtdValue) / lmtdValue) * 100 : 0;

        subordinates.push({
          code: groupValue || positionLabel,
          name: groupValue || positionLabel,
          position: positionLabel,
          mtd_sell_out: mtdValue,
          lmtd_sell_out: lmtdValue,
          sell_out_growth: growth.toFixed(2),
        });
      }
    };

    await groupByField("taluka", "taluka");
    await groupByField("district", "district");
    await groupByField("zone", "zone");

    const finalPositions = [...new Set([...subordinatePositions, "taluka", "district", "zone"])]

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
