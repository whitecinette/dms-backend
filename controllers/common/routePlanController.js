const User = require("../../model/User");
const moment = require("moment-timezone");
const RoutePlan = require("../../model/RoutePlan");
const WeeklyBeatMappingSchedule = require("../../model/WeeklyBeatMappingSchedule");
const HierarchyEntries = require("../../model/HierarchyEntries");
const ActorTypesHierarchy = require("../../model/ActorTypesHierarchy");
const DeletedData = require("../../model/DeletedData");
const Notification = require("../../model/Notification");

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
const formatDate = (date) =>
  new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

exports.addRoutePlan = async (req, res) => {
  try {
    const {
      // startDate,
      // endDate,
      itinerary,
      status = "inactive",
      approved = false,
    } = req.body;

    const { code: userCode, position } = req.user;

    const todayIST = moment().tz("Asia/Kolkata");
    const startDate = todayIST.clone().startOf("day").toDate(); // Today 00:00 IST
    const endDate = todayIST.clone().endOf("day").toDate();

    console.log("Startdate and enddate: ", startDate, endDate);

    const locationFields = [
      "district",
      "taluka",
      "zone",
      "state",
      "province",
      "town",
    ];
    const nameParts = locationFields
      .filter(
        (field) =>
          Array.isArray(itinerary[field]) && itinerary[field].length > 0
      )
      .flatMap((field) => itinerary[field]);

    const name = nameParts.join("-").toLowerCase() || "unnamed-route";

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
    const start = moment(startDate).tz("Asia/Kolkata").startOf("day");
    const end = moment(endDate).tz("Asia/Kolkata").endOf("day");
    const days = [];
    for (let m = moment(start); m.isSameOrBefore(end); m.add(1, "days")) {
      days.push({
        start: m.clone().startOf("day").toDate(),
        end: m.clone().endOf("day").toDate(),
      });
    }

    // 🔸 Get all related hierarchy entries
    const hierarchy = await HierarchyEntries.find({
      hierarchy_name: "default_sales_flow",
      [position]: userCode,
    });

    // 🔸 Extract all dealer and mdd codes
    const dealerCodes = [...new Set(hierarchy.map((h) => h.dealer))];
    const mddCodes = [...new Set(hierarchy.map((h) => h.mdd))];

    for (const { start, end } of days) {
      const existingSchedule = await WeeklyBeatMappingSchedule.findOne({
        code: userCode,
        startDate: { $lte: start },
        endDate: { $gte: start },
      });

      const baseQuery = {
        code: { $in: [...dealerCodes, ...mddCodes] },
        ...(itinerary.district?.length && {
          district: { $in: itinerary.district },
        }),
        ...(itinerary.zone?.length && { zone: { $in: itinerary.zone } }),
        ...(itinerary.taluka?.length && { taluka: { $in: itinerary.taluka } }),
        ...(itinerary.town?.length && { town: { $in: itinerary.town } }),
      };

      const filteredUsers = await User.find(baseQuery);

      const entries = filteredUsers.map((user) => ({
        code: user.code,
        name: user.name,
        latitude: user.latitude || 0,
        longitude: user.longitude || 0,
        status: "pending",
        distance: null,
        district: user.district || "",
        taluka: user.taluka || "",
        town: user.town || "",
        zone: user.zone || "",
        position: user.position || "",
      }));

      if (existingSchedule) {
        const existingCodes = new Set(
          existingSchedule.schedule.map((d) => d.code)
        );
        const newEntries = entries.filter((e) => !existingCodes.has(e.code));

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
    const notification = {
      title: "Route Plan",
      message: `The user with code ${userCode} wants to create ${name} routes from ${formatDate(
        startDate
      )} to ${formatDate(endDate)}.`,
      filters: [name, startDate, endDate],
      targetRole: ["admin", "super_admin"],
    };
    await Notification.create(notification);

    return res.status(201).json({
      message: "Route Plan and beat mappings created successfully.",
      route: newRoute,
    });
  } catch (error) {
    console.error("Error in addRoutePlan:", error);
    return res.status(500).json({ message: "Internal Server Error" });
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

    const formattedRoutes = routes.map((route) => {
      const itinerary = route.itinerary || {};
      let mergedArray = [];

      // ✅ Convert Map or Object safely
      if (itinerary instanceof Map) {
        mergedArray = Array.from(itinerary.values()).flat();
      } else if (typeof itinerary === "object" && itinerary !== null) {
        mergedArray = Object.values(itinerary).filter(Array.isArray).flat();
      }

      return {
        _id: route._id,
        code: route.code,
        name: route.name,
        startDate: moment(route.startDate)
          .tz("Asia/Kolkata")
          .format("YYYY-MM-DD HH:mm:ss"),
        endDate: moment(route.endDate)
          .tz("Asia/Kolkata")
          .format("YYYY-MM-DD HH:mm:ss"),
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
    console.log("Dopppped");
    const { code: userCode, position, role } = req.user;

    if (!position) {
      return res
        .status(400)
        .json({ success: false, message: "User position missing in token" });
    }
    // If role is admin, super_admin or Hr -> return all dropdown options
    if (["admin", "super_admin", "hr"].includes(role)) {
      const users = await User.find({});

      const districts = new Set();
      const talukas = new Set();
      const zones = new Set();
      const towns = new Set();

      users.forEach((user) => {
        if (user.district && !["NA", null, ""].includes(user.district)) {
          districts.add(user.district);
        }
        if (user.taluka && !["NA", null, ""].includes(user.taluka)) {
          talukas.add(user.taluka);
        }
        if (user.zone && !["NA", null, ""].includes(user.zone)) {
          zones.add(user.zone);
        }
        if (user.town && !["NA", null, ""].includes(user.town)) {
          towns.add(user.town);
        }
      });

      return res.status(200).json({
        success: true,
        data: {
          taluka: [...talukas],
          district: [...districts],
          zone: [...zones],
          town: [...towns],
        },
      });
    }

    const hierarchyConfig = await ActorTypesHierarchy.findOne({
      name: "default_sales_flow",
    });
    if (!hierarchyConfig) {
      return res
        .status(400)
        .json({ success: false, message: "Hierarchy config not found" });
    }

    const positionKey = position.toLowerCase();
    if (!hierarchyConfig.hierarchy.includes(positionKey)) {
      return res.status(400).json({
        success: false,
        message: "User position not in hierarchy flow",
      });
    }

    const hierarchyEntries = await HierarchyEntries.find({
      hierarchy_name: "default_sales_flow",
      [positionKey]: userCode,
    });

    const mddCodes = hierarchyEntries.map((entry) => entry.mdd).filter(Boolean);
    const dealerCodes = hierarchyEntries
      .map((entry) => entry.dealer)
      .filter(Boolean);
    const allCodes = [...new Set([...mddCodes, ...dealerCodes])];

    const users = await User.find({ code: { $in: allCodes } });

    const districts = new Set();
    const talukas = new Set();
    const zones = new Set();
    const towns = new Set();

    users.forEach((user) => {
      if (user.district) districts.add(user.district);
      if (user.taluka) talukas.add(user.taluka);
      if (user.zone) zones.add(user.zone);
      if (user.town) towns.add(user.town);
    });

    return res.status(200).json({
      success: true,
      status: ["done", "pending"],
      ["dealer/mdd"]: ["dealer", "mdd"],
      taluka: [...talukas],
      district: [...districts],
      zone: [...zones],
      town: [...towns],
    });
  } catch (error) {
    console.error("Error in getDropdownOptionsForMarketCoverage:", error);
    return res.status(500).json({ success: false, message: "Server error" });
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
      return res
        .status(404)
        .json({ success: false, message: "Route not found" });
    }

    const { code, startDate, endDate } = route;

    // ✅ Ensure itinerary is a plain object
    const itineraryRaw = route.itinerary || {};
    const itinerary =
      itineraryRaw instanceof Map
        ? Object.fromEntries(itineraryRaw)
        : typeof itineraryRaw.toObject === "function"
        ? itineraryRaw.toObject()
        : itineraryRaw;

    console.log("📦 Raw itinerary from DB:", itinerary);

    const deletedBy = {
      code: req.user.code,
      name: req.user.name,
    };

    const itineraryDistricts = new Set(
      (itinerary.district || []).map((v) => v.toLowerCase().trim())
    );
    const itineraryZones = new Set(
      (itinerary.zone || []).map((v) => v.toLowerCase().trim())
    );
    const itineraryTalukas = new Set(
      (itinerary.taluka || []).map((v) => v.toLowerCase().trim())
    );

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

      const updatedSchedule = schedule.schedule.filter((dealer) => {
        const district = (dealer.district || "").toLowerCase().trim();
        const zone = (dealer.zone || "").toLowerCase().trim();
        const taluka = (dealer.taluka || "").toLowerCase().trim();

        const match =
          itineraryDistricts.has(district) ||
          itineraryZones.has(zone) ||
          itineraryTalukas.has(taluka);

        if (match) {
          console.log(
            `🗑️ Deleting: ${dealer.name} (${dealer.code}) | D: ${district}, Z: ${zone}, T: ${taluka}`
          );
        }

        return !match; // ✅ Keep only non-matching
      });

      const removedDealers = schedule.schedule.filter(
        (d) => !updatedSchedule.some((u) => u.code === d.code)
      );

      if (removedDealers.length > 0) {
        removedFromBeatMapping.push({
          beatMappingId: schedule._id,
          startDate: schedule.startDate,
          endDate: schedule.endDate,
          removedDealers,
        });

        schedule.schedule = updatedSchedule;
        schedule.total = updatedSchedule.length;
        schedule.done = updatedSchedule.filter(
          (d) => d.status === "done"
        ).length;
        schedule.pending = updatedSchedule.filter(
          (d) => d.status !== "done"
        ).length;
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
      deletedDealers: removedFromBeatMapping.flatMap((d) =>
        d.removedDealers.map((x) => x.code)
      ),
    });
  } catch (error) {
    console.error("❌ Error in deleteRoutePlanAndUpdateBeatMapping:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

//get All route plan for admin
// exports.getAllRoutePlans = async (req, res) => {
//   try {
//     const { startDate, endDate, status, approved, search, itinerary: itineraryParam } = req.query;

//     // console.log("Request query:", req.query);

//     const query = {};
//     // console.log("Parsed itinerary:", itineraryParam);

//     // Handle date range filters
//     if (startDate && endDate) {
//       const start = new Date(startDate).setHours(0, 0, 0, 0);
//       const end = new Date(endDate).setHours(23, 59, 59, 999);
//       query.startDate = { $gte: start, $lte: end };
//       query.endDate = { $gte: start, $lte: end };
//     }

//     // Handle status filter
//     if (status) {
//       query.status = status;
//     }

//     // Handle approved filter
//     if (approved) {
//       query.approved = approved === 'true'; // Convert string to boolean
//     }

//     // Handle itinerary filters
//     if (itineraryParam && itineraryParam.trim() !== '' && itineraryParam !== '[]') {
//       try {
//         const itinerary = JSON.parse(itineraryParam); // e.g., { "taluka": ["Dausa (M)"] }

//         // Validate itinerary input
//         if (typeof itinerary !== 'object' || Array.isArray(itinerary) || Object.keys(itinerary).length === 0) {
//           return res.status(400).json({ success: false, message: "Invalid itinerary filter format" });
//         }

//         // Build query for itinerary map
//         Object.entries(itinerary).forEach(([key, values]) => {
//           if (Array.isArray(values) && values.length > 0) {
//             query[`itinerary.${key}`] = { $in: values.map(val => val.trim()) };
//           } else if (typeof values === 'string' && values.trim() !== '') {
//             query[`itinerary.${key}`] = { $in: [values.trim()] };
//           }
//         });
//       } catch (err) {
//         console.warn("Invalid itinerary JSON:", err.message);
//         return res.status(400).json({ success: false, message: "Invalid itinerary filter format" });
//       }
//     }

//     // Fetch routes based on the constructed query
//     // console.log("🚀 Query:", JSON.stringify(query, null, 2));
//     const routes = await RoutePlan.find(query);

//     // Fetch employees to map employee details
//     const employees = await User.find(
//       { role: "employee" },
//       "code name position"
//     );

//     const employeeMap = employees.reduce((acc, emp) => {
//       acc[emp.code.trim().toLowerCase()] = {
//         name: emp.name,
//         position: emp.position,
//       };
//       return acc;
//     }, {});

//    // Format routes with employee details
//     const formattedRoutes = routes.map((route) => {
//       const code = route.code;
//       const employeeInfo = employeeMap[code.toLowerCase()];
//       return {
//         _id: route._id,
//         code: route.code,
//         name: route.name,
//         startDate: route.startDate,
//         endDate: route.endDate,
//         status: route.status,
//         approved: route.approved,
//         EmpName: employeeInfo?.name || null,
//         position: employeeInfo?.position || null,
//         itinerary: route.itinerary,
//       };
//     });

//     // Apply search filter on code, name, and EmpName
//     const filteredRoutes = formattedRoutes.filter((route) => {
//       const searchTerms = search ? search.toLowerCase().split(" ") : [];
//       return searchTerms.every((term) => {
//         return (
//           route.code.toLowerCase().includes(term) ||
//           route.name.toLowerCase().includes(term) ||
//           route.EmpName?.toLowerCase().includes(term)
//         );
//       });
//     });

//     res.status(200).json({
//       success: true,
//       data: filteredRoutes,
//     });
//   } catch (err) {
//     console.error("Error in getAllRoutePlans:", err);
//     return res.status(500).json({ success: false, message: "Server error" });
//   }
// };

//edit route plan by admin
exports.editRoutePlan = async (req, res) => {
  try {
    const { routeId } = req.params;
    const { approved, status } = req.body;
    const route = await RoutePlan.findById(routeId);
    console.log(req.body);
    if (!route) {
      return res
        .status(404)
        .json({ success: false, message: "Route not found" });
    }

    route.approved = approved;

    if (status) {
      route.status = status;
    }
    await route.save();

    return res
      .status(200)
      .json({ success: true, message: "Route updated successfully" });
  } catch (err) {
    console.error("Error in editRoutePlan:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.getAllRoutePlans = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      status,
      approved,
      search,
      itinerary: itineraryParam,
    } = req.query;

    const query = {};

    // Normalize and set timezone to UTC
    if (startDate && endDate) {
      const start = new Date(startDate).setHours(0, 0, 0, 0);
      const end = new Date(endDate).setHours(23, 59, 59, 999);

      // Ensure startDate is not after endDate
      if (start > end) {
        return res.status(400).json({
          success: false,
          message: "startDate cannot be after endDate",
        });
      }

      query.startDate = { $gte: start };
      query.endDate = { $lte: end };
    }
    // if (startDate && endDate) {
    //
    // }

    if (status) query.status = status;
    if (approved) query.approved = approved === "true";

    if (
      itineraryParam &&
      itineraryParam.trim() !== "" &&
      itineraryParam !== "[]"
    ) {
      try {
        const itinerary = JSON.parse(itineraryParam); // e.g., { "taluka": ["Dausa (M)"] }

        // Validate itinerary input
        if (
          typeof itinerary !== "object" ||
          Array.isArray(itinerary) ||
          Object.keys(itinerary).length === 0
        ) {
          return res.status(400).json({
            success: false,
            message: "Invalid itinerary filter format",
          });
        }

        // Build query for itinerary map
        Object.entries(itinerary).forEach(([key, values]) => {
          if (Array.isArray(values) && values.length > 0) {
            query[`itinerary.${key}`] = {
              $in: values.map((val) => val.trim()),
            };
          } else if (typeof values === "string" && values.trim() !== "") {
            query[`itinerary.${key}`] = { $in: [values.trim()] };
          }
        });
      } catch (err) {
        console.warn("Invalid itinerary JSON:", err.message);
        return res
          .status(400)
          .json({ success: false, message: "Invalid itinerary filter format" });
      }
    }

    // Fetch routes and employees
    const routes = await RoutePlan.find(query);
    const employees = await User.find(
      { role: "employee" },
      "code name position"
    );

    // Create employee map for easy lookup
    const employeeMap = employees.reduce((acc, emp) => {
      acc[emp.code.trim().toLowerCase()] = {
        name: emp.name,
        position: emp.position,
      };
      return acc;
    }, {});

    // Process each route and get matching dealers
    const results = await Promise.all(
      routes.map(async (route) => {
        const empCode = route.code?.toLowerCase();
        const itinerary = route.itinerary || {};

        // Fetch beat mappings in date range for this code
        const schedules = await WeeklyBeatMappingSchedule.find({
          code: route.code,
          $or: [
            {
              startDate: { $lte: route.endDate },
              endDate: { $gte: route.startDate },
            },
          ],
        });

        // Flatten all dealer entries from schedule for the current route
        const allDealers = schedules.flatMap((mapping) => {
          const mappingStart = new Date(mapping.startDate).toISOString(); // Normalize
          const mappingEnd = new Date(mapping.endDate).toISOString(); // Normalize
          const routeStart = new Date(route.startDate).toISOString(); // Normalize
          const routeEnd = new Date(route.endDate).toISOString(); // Normalize

          const inRange = mappingEnd >= routeStart && mappingStart <= routeEnd;
          if (!inRange) return [];

          return mapping.schedule.map((dealer) => ({
            code: dealer.code?.trim(),
            name: dealer.name,
            district: dealer.district?.trim(),
            taluka: dealer.taluka?.trim(),
            zone: dealer.zone?.trim(),
            town: dealer.town?.trim(),
            position: dealer.position,
            status: dealer.status,
          }));
        });

        // Filter dealers by itinerary match for the current route
        const filteredDealers = allDealers.filter((dealer) => {
          // Match against itinerary fields
          const matchTaluka = itinerary
            .get("taluka")
            ?.some((t) => dealer.taluka?.toLowerCase() === t.toLowerCase());
          const matchDistrict = itinerary
            .get("district")
            ?.some((d) => dealer.district?.toLowerCase() === d.toLowerCase());
          const matchZone = itinerary
            .get("zone")
            ?.some((z) => dealer.zone?.toLowerCase() === z.toLowerCase());
          const matchTown = itinerary
            .get("town")
            ?.some((z) => dealer.town?.toLowerCase() === z.toLowerCase());
          // If any match is found in taluka, district, or zone
          return matchTaluka || matchDistrict || matchZone || matchTown;
        });

        // Remove duplicates by code
        const dealerMap = filteredDealers.reduce((acc, dealer) => {
          const code = dealer.code;

          // If this code is not in map yet, or if current dealer is 'done' and existing is not
          if (
            !acc[code] ||
            (dealer.status?.toLowerCase() === "done" &&
              acc[code].status?.toLowerCase() !== "done")
          ) {
            acc[code] = dealer;
          }

          return acc;
        }, {});

        const matchedDealers = Object.values(dealerMap);

        // Calculate total, done, pending, and town count
        const total = matchedDealers.length;
        const done = matchedDealers.filter(
          (d) => d.status?.toLowerCase() === "done"
        ).length;
        const pending = total - done;
        // Calculate unique towns
        const uniqueTowns = [
          ...new Set(
            matchedDealers
              .filter((d) => d.town) // Ensure town exists
              .map((d) => d.town.toLowerCase())
          ),
        ].length;

        return {
          id: route._id,
          code: route.code,
          name: route.name,
          EmpName: employeeMap[empCode]?.name || null,
          position: employeeMap[empCode]?.position || null,
          routeName: route.name,
          startDate: route.startDate,
          endDate: route.endDate,
          status: route.status,
          itinerary: route.itinerary,
          approved: route.approved,
          total,
          done,
          pending,
          townCount: uniqueTowns, // Added town count
        };
      })
    );

    // Optional: apply search filter on name/code/position
    const filtered = search
      ? results.filter((r) => {
          const term = search.toLowerCase();
          return (
            r.code?.toLowerCase().includes(term) ||
            r.name?.toLowerCase().includes(term) ||
            r.position?.toLowerCase().includes(term)
          );
        })
      : results;

    return res.status(200).json({ success: true, data: filtered });
  } catch (err) {
    console.error("Error in getAllRoutePlans:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
