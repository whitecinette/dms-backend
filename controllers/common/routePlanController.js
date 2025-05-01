const User = require('../../model/User');
const moment = require('moment-timezone');
const RoutePlan = require('../../model/RoutePlan');
const WeeklyBeatMappingSchedule = require('../../model/WeeklyBeatMappingSchedule');
const HierarchyEntries = require('../../model/HierarchyEntries');

exports.addRoutePlan = async (req, res) => {
  try {
    const { startDate, endDate, itinerary, status = 'inactive', approved = false } = req.body;
    const code = req.user.code;

    const locationFields = ['district', 'taluka', 'zone', 'state', 'province'];

    const nameParts = locationFields
    .filter(field => Array.isArray(itinerary[field]) && itinerary[field].length > 0)
    .flatMap(field => itinerary[field]);

    const name = nameParts.join('-').toLowerCase() || 'unnamed-route';


    const newRoute = new RoutePlan({
      startDate,
      endDate,
      code,
      name,
      itinerary,
      status,
      approved,
    });

    await newRoute.save();

    const start = moment(startDate).tz('Asia/Kolkata').startOf('day');
    const end = moment(endDate).tz('Asia/Kolkata').endOf('day');
    const days = [];
    for (let m = moment(start); m.isSameOrBefore(end); m.add(1, 'days')) {
      days.push({
        start: m.clone().startOf('day').toDate(),
        end: m.clone().endOf('day').toDate(),
      });
    }

    const hierarchy = await HierarchyEntries.find({ hierarchy_name: 'default_sales_flow' });

    for (const { start, end } of days) {
    const existingSchedules = await WeeklyBeatMappingSchedule.findOne({
        code,
        startDate: { $lte: start },
        endDate: { $gte: start }, // if any entry overlaps this day
        });
          

        if (existingSchedules) {
            const existingCodes = new Set(existingSchedules.schedule.map(d => d.code));
          
            const newDealers = await User.find({
              position: { $in: ['dealer', 'mdd'] },
              ...(itinerary.district.length && { district: { $in: itinerary.district } }),
              ...(itinerary.zone?.length && { zone: { $in: itinerary.zone } }),
              ...(itinerary.taluka?.length && { taluka: { $in: itinerary.taluka } }),
              code: { $nin: Array.from(existingCodes) }, // avoid duplicates
            });
          
            const newScheduleEntries = newDealers.map(user => ({
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
          
            existingSchedules.schedule.push(...newScheduleEntries);
            existingSchedules.total += newScheduleEntries.length;
            existingSchedules.pending += newScheduleEntries.length;
          
            await existingSchedules.save();
            continue;
          }
          


      const filteredDealers = await User.find({
        position: { $in: ['dealer', 'mdd'] },
        ...(itinerary.district.length && { district: { $in: itinerary.district } }),
        ...(itinerary.zone?.length && { zone: { $in: itinerary.zone } }),
        ...(itinerary.taluka?.length && { taluka: { $in: itinerary.taluka } }),
      });

      const schedule = filteredDealers.map(user => ({
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

      await WeeklyBeatMappingSchedule.create({
        startDate: start,
        endDate: end,
        code,
        schedule,
        total: schedule.length,
        done: 0,
        pending: schedule.length,
      });
    }

    res.status(201).json({ message: 'Route Plan added and beat mappings created successfully.', route: newRoute });
  } catch (error) {
    console.error('Error in addRoutePlan:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};
