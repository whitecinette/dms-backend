const ActorCode = require("../../model/ActorCode");
const HierarchyEntries = require("../../model/HierarchyEntries");
const SalesData = require("../../model/SalesData");


// exports.getSubordinatesByCode = async (req, res) => {
//   try {
//     const { code } = req.query;
//     if (!code) {
//       return res.status(400).json({ success: false, message: "Code is required." });
//     }

//     // Fetch actor details (position)
//     const actor = await ActorCode.findOne({ code });
//     if (!actor) {
//       return res.status(404).json({ success: false, message: "Actor not found." });
//     }

//     const { position } = actor;
//     if (!position) {
//       return res.status(400).json({ success: false, message: "Position not found for this user." });
//     }

//     // Fetch all hierarchy entries where this user appears in their position
//     const hierarchyEntries = await HierarchyEntries.find({ [position]: code });

//     if (!hierarchyEntries.length) {
//       return res.status(200).json({ success: true, positions: [], subordinates: {} });
//     }

//     // Identify subordinate positions dynamically (positions below the current position)
//     const allPositions = ["smd", "asm", "mdd" ,"ase", "rso", "tse", "dealer"];
//     const userPositionIndex = allPositions.indexOf(position);
//     const subordinatePositions = allPositions.slice(userPositionIndex + 1);

//     // Collect subordinate codes
//     let subordinateData = {};
//     for (let subPosition of subordinatePositions) {
//       let subCodes = hierarchyEntries.map(entry => entry[subPosition]).filter(Boolean);
//       if (subCodes.length > 0) {
//         subordinateData[subPosition] = subCodes;
//       }
//     }

//     // Fetch names for subordinate codes
//     let subordinatesGrouped = {};
//     for (let [subPosition, codes] of Object.entries(subordinateData)) {
//       let users = await ActorCode.find({ code: { $in: codes } }, { code: 1, name: 1, position: 1, _id: 0 });

//       subordinatesGrouped[subPosition] = users.map(user => ({
//         code: user.code,
//         name: user.name,
//       }));
//     }

//     // Return response with positions and grouped subordinates
//     res.status(200).json({
//       success: true,
//       positions: Object.keys(subordinateData),
//       subordinates: subordinatesGrouped
//     });

//   } catch (error) {
//     console.error("Error in getSubordinates:", error);
//     res.status(500).json({ success: false, message: "Internal server error" });
//   }
// };

// exports.getSubordinatesForUser = async (req, res) => {
//     try {
//       const { code } = req;
//       if (!code) {
//         return res.status(400).json({ success: false, message: "Code is required." });
//       }
  
//       // Fetch actor details (position)
//       const actor = await ActorCode.findOne({ code });
//       if (!actor) {
//         return res.status(404).json({ success: false, message: "Actor not found." });
//       }
  
//       const { position } = actor;
//       if (!position) {
//         return res.status(400).json({ success: false, message: "Position not found for this user." });
//       }
  
//       // Fetch all hierarchy entries where this user appears in their position
//       const hierarchyEntries = await HierarchyEntries.find({ [position]: code });
  
//       if (!hierarchyEntries.length) {
//         return res.status(200).json({ success: true, positions: [], subordinates: {} });
//       }
  
//       // Identify subordinate positions dynamically (positions below the current position)
//       const allPositions = ["smd", "asm", "mdd", "ase", "rso", "tse", "dealer"];
//       const userPositionIndex = allPositions.indexOf(position);
//       const subordinatePositions = allPositions.slice(userPositionIndex + 1);
  
//       // Collect subordinate codes
//       let subordinateData = {};
//       for (let subPosition of subordinatePositions) {
//         let subCodes = hierarchyEntries.map(entry => entry[subPosition]).filter(Boolean);
//         if (subCodes.length > 0) {
//           subordinateData[subPosition] = subCodes;
//         }
//       }
  
//       // Fetch names for subordinate codes
//       let subordinatesGrouped = {};
//       for (let [subPosition, codes] of Object.entries(subordinateData)) {
//         let users = await ActorCode.find({ code: { $in: codes } }, { code: 1, name: 1, position: 1, _id: 0 });
  
//         subordinatesGrouped[subPosition] = users.map(user => ({
//           code: user.code,
//           name: user.name,
//         }));
//       }
  
//       // Return response with positions and grouped subordinates
//       res.status(200).json({
//         success: true,
//         positions: Object.keys(subordinateData),
//         subordinates: subordinatesGrouped
//       });
  
//     } catch (error) {
//       console.error("Error in getSubordinates:", error);
//       res.status(500).json({ success: false, message: "Internal server error" });
//     }
//   };

exports.getSubordinatesByCode = async (req, res) => {
  try {
    const { code, filter_type = "value", start_date, end_date } = req.body; // Use req.body

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

    // Fetch hierarchy entries
    const hierarchyEntries = await HierarchyEntries.find({ [position]: code });

    if (!hierarchyEntries.length) {
      return res.status(200).json({ success: true, position: null, subordinates: {} });
    }

    // Define position hierarchy
    const allPositions = ["smd", "asm", "mdd", "ase", "rso", "tse", "dealer"];
    const userPositionIndex = allPositions.indexOf(position);

    if (userPositionIndex === -1 || userPositionIndex === allPositions.length - 1) {
      return res.status(200).json({ success: true, position: null, subordinates: {} });
    }

    // Get the immediate next subordinate position
    const nextSubordinatePosition = allPositions[userPositionIndex + 1];

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

    res.status(200).json({ success: true, position: nextSubordinatePosition, subordinates: salesData });

  } catch (error) {
    console.error("Error in getSubordinatesByCode:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

exports.getSubordinatesForUser = async (req, res) => {
  try {
    const { code } = req;
    const { filter_type = "value", start_date, end_date } = req.body; // Use req.body

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

    // Fetch hierarchy entries
    const hierarchyEntries = await HierarchyEntries.find({ [position]: code });

    if (!hierarchyEntries.length) {
      return res.status(200).json({ success: true, position: null, subordinates: {} });
    }

    // Define position hierarchy
    const allPositions = ["smd", "asm", "mdd", "ase", "rso", "tse", "dealer"];
    const userPositionIndex = allPositions.indexOf(position);

    if (userPositionIndex === -1 || userPositionIndex === allPositions.length - 1) {
      return res.status(200).json({ success: true, position: null, subordinates: {} });
    }

    // Get the immediate next subordinate position
    const nextSubordinatePosition = allPositions[userPositionIndex + 1];

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

    res.status(200).json({ success: true, position: nextSubordinatePosition, subordinates: salesData });

  } catch (error) {
    console.error("Error in getSubordinatesByCode:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};
  