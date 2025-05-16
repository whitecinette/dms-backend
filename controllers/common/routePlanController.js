const User = require('../../model/User');
const moment = require('moment-timezone');
const RoutePlan = require('../../model/RoutePlan');
const WeeklyBeatMappingSchedule = require('../../model/WeeklyBeatMappingSchedule');
const HierarchyEntries = require('../../model/HierarchyEntries');
const ActorTypesHierarchy = require('../../model/ActorTypesHierarchy');
const DeletedData = require('../../model/DeletedData');

// exports.addRoutePlan = async (req, res) => {
//   try {
//     const { startDate, endDate, itinerary, status = 'inactive', approved = false } = req.body;
//     const code = req.user.code;

//     const locationFields = ['district', 'taluka', 'zone', 'state', 'province'];

//     const nameParts = locationFields
//     .filter(field => Array.isArray(itinerary[field]) && itinerary[field].length > 0)
//     .flatMap(field => itinerary[field]);

//     const name = nameParts.join('-').toLowerCase() || 'unnamed-route';


//     const newRoute = new RoutePlan({
//       startDate,
//       endDate,
//       code,
//       name,
//       itinerary,
//       status,
//       approved,
//     });

//     await newRoute.save();

//     const start = moment(startDate).tz('Asia/Kolkata').startOf('day');
//     const end = moment(endDate).tz('Asia/Kolkata').endOf('day');
//     const days = [];
//     for (let m = moment(start); m.isSameOrBefore(end); m.add(1, 'days')) {
//       days.push({
//         start: m.clone().startOf('day').toDate(),
//         end: m.clone().endOf('day').toDate(),
//       });
//     }

//     const hierarchy = await HierarchyEntries.find({ hierarchy_name: 'default_sales_flow' });

//     for (const { start, end } of days) {
//     const existingSchedules = await WeeklyBeatMappingSchedule.findOne({
//         code,
//         startDate: { $lte: start },
//         endDate: { $gte: start }, // if any entry overlaps this day
//         });
          

//         if (existingSchedules) {
//             const existingCodes = new Set(existingSchedules.schedule.map(d => d.code));
          
//             const newDealers = await User.find({
//               position: { $in: ['dealer', 'mdd'] },
//               ...(itinerary.district.length && { district: { $in: itinerary.district } }),
//               ...(itinerary.zone?.length && { zone: { $in: itinerary.zone } }),
//               ...(itinerary.taluka?.length && { taluka: { $in: itinerary.taluka } }),
//               code: { $nin: Array.from(existingCodes) }, // avoid duplicates
//             });
          
//             const newScheduleEntries = newDealers.map(user => ({
//               code: user.code,
//               name: user.name,
//               latitude: user.latitude || 0,
//               longitude: user.longitude || 0,
//               status: 'pending',
//               distance: null,
//               district: user.district || '',
//               taluka: user.taluka || '',
//               zone: user.zone || '',
//               position: user.position || '',
//             }));
          
//             existingSchedules.schedule.push(...newScheduleEntries);
//             existingSchedules.total += newScheduleEntries.length;
//             existingSchedules.pending += newScheduleEntries.length;
          
//             await existingSchedules.save();
//             continue;
//           }
          


//       const filteredDealers = await User.find({
//         position: { $in: ['dealer', 'mdd'] },
//         ...(itinerary.district.length && { district: { $in: itinerary.district } }),
//         ...(itinerary.zone?.length && { zone: { $in: itinerary.zone } }),
//         ...(itinerary.taluka?.length && { taluka: { $in: itinerary.taluka } }),
//       });

//       const schedule = filteredDealers.map(user => ({
//         code: user.code,
//         name: user.name,
//         latitude: user.latitude || 0,
//         longitude: user.longitude || 0,
//         status: 'pending',
//         distance: null,
//         district: user.district || '',
//         taluka: user.taluka || '',
//         zone: user.zone || '',
//         position: user.position || '',
//       }));

//       await WeeklyBeatMappingSchedule.create({
//         startDate: start,
//         endDate: end,
//         code,
//         schedule,
//         total: schedule.length,
//         done: 0,
//         pending: schedule.length,
//       });
//     }

//     res.status(201).json({ message: 'Route Plan added and beat mappings created successfully.', route: newRoute });
//   } catch (error) {
//     console.error('Error in addRoutePlan:', error);
//     res.status(500).json({ message: 'Internal Server Error' });
//   }
// };

exports.addRoutePlan = async (req, res) => {
  try {
    const { startDate, endDate, itinerary, status = 'inactive', approved = false } = req.body;
    const { code: userCode, position } = req.user;

    const locationFields = ['district', 'taluka', 'zone', 'state', 'province'];
    const nameParts = locationFields
      .filter(field => Array.isArray(itinerary[field]) && itinerary[field].length > 0)
      .flatMap(field => itinerary[field]);

    const name = nameParts.join('-').toLowerCase() || 'unnamed-route';

    // 🔸 Save route first
    const newRoute = new RoutePlan({
      startDate,
      endDate,
      code: userCode,
      name,
      itinerary,
      status,
      approved,
    });
    await newRoute.save();

    // 🔸 Date range breakdown (per day)
    const start = moment(startDate).tz('Asia/Kolkata').startOf('day');
    const end = moment(endDate).tz('Asia/Kolkata').endOf('day');
    const days = [];
    for (let m = moment(start); m.isSameOrBefore(end); m.add(1, 'days')) {
      days.push({
        start: m.clone().startOf('day').toDate(),
        end: m.clone().endOf('day').toDate(),
      });
    }

    // 🔸 Get all related hierarchy entries
    const hierarchy = await HierarchyEntries.find({
      hierarchy_name: 'default_sales_flow',
      [position]: userCode,
    });

    // 🔸 Extract all dealer and mdd codes
    const dealerCodes = [...new Set(hierarchy.map(h => h.dealer))];
    const mddCodes = [...new Set(hierarchy.map(h => h.mdd))];

    for (const { start, end } of days) {
      const existingSchedule = await WeeklyBeatMappingSchedule.findOne({
        code: userCode,
        startDate: { $lte: start },
        endDate: { $gte: start },
      });

      const baseQuery = {
        code: { $in: [...dealerCodes, ...mddCodes] },
        ...(itinerary.district?.length && { district: { $in: itinerary.district } }),
        ...(itinerary.zone?.length && { zone: { $in: itinerary.zone } }),
        ...(itinerary.taluka?.length && { taluka: { $in: itinerary.taluka } }),
      };

      const filteredUsers = await User.find(baseQuery);

      const entries = filteredUsers.map(user => ({
        code: user.code,
        name: user.name,
        latitude: user.latitude || 0,
        longitude: user.longitude || 0,
        status: 'pending',
        distance: null,
        district: user.district || '',
        taluka: user.taluka || '',
        zone: user.zone || '',
        position: user.position || '',
      }));

      if (existingSchedule) {
        const existingCodes = new Set(existingSchedule.schedule.map(d => d.code));
        const newEntries = entries.filter(e => !existingCodes.has(e.code));

        existingSchedule.schedule.push(...newEntries);
        existingSchedule.total += newEntries.length;
        existingSchedule.pending += newEntries.length;
        await existingSchedule.save();
      } else {
        await WeeklyBeatMappingSchedule.create({
          startDate: start,
          endDate: end,
          code: userCode,
          schedule: entries,
          total: entries.length,
          done: 0,
          pending: entries.length,
        });
      }
    }

    return res.status(201).json({
      message: 'Route Plan and beat mappings created successfully.',
      route: newRoute,
    });
  } catch (error) {
    console.error('Error in addRoutePlan:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};


exports.getRoutePlansForUser = async (req, res) => {
  try {
    console.log("Reaching route plan");
    const { startDate, endDate } = req.body;
    const userCode = req.user.code;

    const query = { code: userCode };

    if (startDate && endDate) {
      query.startDate = { $lte: new Date(endDate) };
      query.endDate = { $gte: new Date(startDate) };
    }

    const routes = await RoutePlan.find(query).sort({ createdAt: -1 });


    const formattedRoutes = routes.map(route => {
      const itinerary = route.itinerary || {};
      let mergedArray = [];

      // ✅ Convert Map or Object safely
      if (itinerary instanceof Map) {
        mergedArray = Array.from(itinerary.values()).flat();
      } else if (typeof itinerary === 'object' && itinerary !== null) {
        mergedArray = Object.values(itinerary).filter(Array.isArray).flat();
      }

      return {
        _id: route._id,
        code: route.code,
        name: route.name,
        startDate: route.startDate,
        endDate: route.endDate,
        status: route.status,
        approved: route.approved,
        itinerary: mergedArray, // ✅ Final merged array
      };
    });

    return res.status(200).json({
      success: true,
      data: formattedRoutes,
    });

  } catch (err) {
    console.error("Error in getRoutePlansForUser:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};


// USER MODEL APIS 
exports.getDropdownOptionsForMarketCoverageUser = async (req, res) => {
  try {
    console.log("Dopppped")
    const { code: userCode, position } = req.user;

    if (!position) {
      return res.status(400).json({ success: false, message: 'User position missing in token' });
    }

    const hierarchyConfig = await ActorTypesHierarchy.findOne({ name: 'default_sales_flow' });
    if (!hierarchyConfig) {
      return res.status(400).json({ success: false, message: 'Hierarchy config not found' });
    }

    const positionKey = position.toLowerCase();
    if (!hierarchyConfig.hierarchy.includes(positionKey)) {
      return res.status(400).json({ success: false, message: 'User position not in hierarchy flow' });
    }

    const hierarchyEntries = await HierarchyEntries.find({
      hierarchy_name: 'default_sales_flow',
      [positionKey]: userCode,
    });

    const mddCodes = hierarchyEntries.map(entry => entry.mdd).filter(Boolean);
    const dealerCodes = hierarchyEntries.map(entry => entry.dealer).filter(Boolean);
    const allCodes = [...new Set([...mddCodes, ...dealerCodes])];

    const users = await User.find({ code: { $in: allCodes } });

    const districts = new Set();
    const talukas = new Set();
    const zones = new Set();

    users.forEach(user => {
      if (user.district) districts.add(user.district);
      if (user.taluka) talukas.add(user.taluka);
      if (user.zone) zones.add(user.zone);
    });

    return res.status(200).json({
      success: true,
      status: ['done', 'pending'],
      ['dealer/mdd']: ['dealer', 'mdd'],
      taluka: [...talukas],
      district: [...districts],
      zone: [...zones],
    });

  } catch (error) {
    console.error("Error in getDropdownOptionsForMarketCoverage:", error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};


// exports.deleteRoutePlanAndUpdateBeatMapping = async (req, res) => {
//   try {
//     const routeId = req.params.routeId;
//     const route = await RoutePlan.findById(routeId);
//     if (!route) {
//       return res.status(404).json({ success: false, message: "Route not found" });
//     }

//     const { code, itinerary, startDate, endDate } = route;
//     const deletedBy = {
//       code: req.user.code,
//       name: req.user.name,
//     };

//     // Prepare filters for relevant beat mapping schedules
//     const dateFilter = {
//       startDate: { $lte: new Date(endDate) },
//       endDate: { $gte: new Date(startDate) },
//       code,
//     };

//     const matchingSchedules = await WeeklyBeatMappingSchedule.find(dateFilter);
//     const removedFromBeatMapping = [];

//     for (let schedule of matchingSchedules) {
//       const originalSchedule = [...schedule.schedule];
//       const talukas = itinerary?.taluka ?? [];
//       const zones = itinerary?.zone ?? [];
//       const districts = itinerary?.district ?? [];

//       const updatedSchedule = schedule.schedule.filter(d => {
//         return !(
//           talukas.includes(d.taluka) ||
//           zones.includes(d.zone) ||
//           districts.includes(d.district)
//         );
//       });

//       if (updatedSchedule.length < schedule.schedule.length) {
//         const removedDealers = originalSchedule.filter(d => !updatedSchedule.some(u => u.code === d.code));
//         removedFromBeatMapping.push({
//           beatMappingId: schedule._id,
//           startDate: schedule.startDate,
//           endDate: schedule.endDate,
//           removedDealers,
//         });

//         schedule.schedule = updatedSchedule;
//         schedule.total = updatedSchedule.length;
//         schedule.done = updatedSchedule.filter(d => d.status === "done").length;
//         schedule.pending = updatedSchedule.filter(d => d.status !== "done").length;
//         await schedule.save();
//       }
//     }

//     // Archive everything in one DeletedData document
//     await DeletedData.create({
//       collectionName: "RoutePlan+BeatMapping",
//       data: {
//         routeId,
//         routeInfo: route.toObject(),
//         removedFromBeatMapping,
//       },
//       deletedBy,
//     });

//     await route.deleteOne();

//     return res.status(200).json({ success: true, message: "Route and related beat mapping dealers deleted and archived." });

//   } catch (error) {
//     console.error("Error in deleteRoutePlanAndUpdateBeatMapping:", error);
//     return res.status(500).json({ success: false, message: "Server error" });
//   }
// };

exports.deleteRoutePlanAndUpdateBeatMapping = async (req, res) => {
  try {
    const routeId = req.params.routeId;
    const route = await RoutePlan.findById(routeId);
    if (!route) {
      return res.status(404).json({ success: false, message: "Route not found" });
    }

    const { code, startDate, endDate } = route;

    // ✅ Ensure itinerary is a plain object
    const itineraryRaw = route.itinerary || {};
    const itinerary =
      itineraryRaw instanceof Map
        ? Object.fromEntries(itineraryRaw)
        : typeof itineraryRaw.toObject === 'function'
        ? itineraryRaw.toObject()
        : itineraryRaw;

    console.log("📦 Raw itinerary from DB:", itinerary);

    const deletedBy = {
      code: req.user.code,
      name: req.user.name,
    };

    const itineraryDistricts = new Set((itinerary.district || []).map(v => v.toLowerCase().trim()));
    const itineraryZones = new Set((itinerary.zone || []).map(v => v.toLowerCase().trim()));
    const itineraryTalukas = new Set((itinerary.taluka || []).map(v => v.toLowerCase().trim()));

    console.log("🧭 Itinerary to match:", {
      districts: [...itineraryDistricts],
      zones: [...itineraryZones],
      talukas: [...itineraryTalukas],
    });

    const dateFilter = {
      startDate: { $lte: new Date(endDate) },
      endDate: { $gte: new Date(startDate) },
      code,
    };

    const matchingSchedules = await WeeklyBeatMappingSchedule.find(dateFilter);
    const removedFromBeatMapping = [];

    for (const schedule of matchingSchedules) {
      const originalSchedule = [...schedule.schedule];

      const updatedSchedule = schedule.schedule.filter(dealer => {
        const district = (dealer.district || "").toLowerCase().trim();
        const zone = (dealer.zone || "").toLowerCase().trim();
        const taluka = (dealer.taluka || "").toLowerCase().trim();

        const match =
          itineraryDistricts.has(district) ||
          itineraryZones.has(zone) ||
          itineraryTalukas.has(taluka);

        if (match) {
          console.log(`🗑️ Deleting: ${dealer.name} (${dealer.code}) | D: ${district}, Z: ${zone}, T: ${taluka}`);
        }

        return !match; // ✅ Keep only non-matching
      });

      const removedDealers = schedule.schedule.filter(d => !updatedSchedule.some(u => u.code === d.code));

      if (removedDealers.length > 0) {
        removedFromBeatMapping.push({
          beatMappingId: schedule._id,
          startDate: schedule.startDate,
          endDate: schedule.endDate,
          removedDealers,
        });

        schedule.schedule = updatedSchedule;
        schedule.total = updatedSchedule.length;
        schedule.done = updatedSchedule.filter(d => d.status === "done").length;
        schedule.pending = updatedSchedule.filter(d => d.status !== "done").length;
        await schedule.save();
      }
    }

    await DeletedData.create({
      collectionName: "RoutePlan+BeatMapping",
      data: {
        routeId,
        routeInfo: route.toObject(),
        removedFromBeatMapping,
      },
      deletedBy,
    });

    await route.deleteOne();

    return res.status(200).json({
      success: true,
      message: "Route and matching beat mapping dealers deleted.",
      deletedDealers: removedFromBeatMapping.flatMap(d => d.removedDealers.map(x => x.code)),
    });

  } catch (error) {
    console.error("❌ Error in deleteRoutePlanAndUpdateBeatMapping:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};







