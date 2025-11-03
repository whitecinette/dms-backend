const Session = require("../../model/Session");
const User = require("../../model/User");

exports.getUserWiseSessions = async (req, res) => {
  try {
    const { start_date, end_date } = req.body;
    const { code, position, role } = req.user; // from auth middleware

    // Only super_admin can access
    if (role !== "super_admin") {
      return res.status(403).json({ success: false, message: "Unauthorized access" });
    }

    // ✅ Date Handling
    const now = new Date();
    const startDate = start_date ? new Date(start_date) : new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = end_date
      ? new Date(end_date)
      : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    startDate.setUTCHours(0, 0, 0, 0);
    endDate.setUTCHours(23, 59, 59, 999);

    // ✅ Fetch sessions within date range
    const sessions = await Session.find({
      loginTime: { $gte: startDate, $lte: endDate },
    }).sort({ loginTime: -1 });

    if (!sessions.length) {
      return res.status(200).json({ success: true, message: "No sessions found for this period.", data: [] });
    }

    // ✅ Get unique user IDs from these sessions
    const userIds = [...new Set(sessions.map((s) => s.userId.toString()))];

    // ✅ Fetch corresponding user details
    const users = await User.find(
      { _id: { $in: userIds } },
      { name: 1, code: 1, position: 1 }
    ).lean();

    // Create a quick lookup
    const userMap = users.reduce((acc, user) => {
      acc[user._id.toString()] = user;
      return acc;
    }, {});

    // ✅ Group sessions by user
    const grouped = {};
    for (const s of sessions) {
      const uid = s.userId.toString();
      const user = userMap[uid];
      if (!user) continue;

      if (!grouped[uid]) {
        grouped[uid] = {
          code: user.code,
          name: user.name,
          position: user.position,
          sessions: [],
        };
      }

      grouped[uid].sessions.push({
        sessionId: s._id,
        deviceId: s.deviceId,
        deviceInfo: s.deviceInfo,
        ip: s.deviceInfo?.ip || null,
        userAgent: s.deviceInfo?.userAgent || null,
        loginTime: s.loginTime,
        lastActive: s.lastActive,
        status: s.status,
      });
    }

    // ✅ Convert to clean array
    const result = Object.values(grouped);

    return res.status(200).json({
      success: true,
      count: result.length,
      date_range: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
      data: result,
    });
  } catch (error) {
    console.error("Error fetching user sessions:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};
