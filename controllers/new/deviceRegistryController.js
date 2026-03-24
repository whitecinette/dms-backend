const DeviceRegistry = require("../../model/DeviceRegistry");
const Session = require("../../model/Session");
const User = require("../../model/User");


exports.getPendingDevices = async (req, res) => {
  try {
    const regs = await DeviceRegistry.find({ "devices.status": "pending" }).lean();

    const pending = [];
    for (const r of regs) {
      for (const d of r.devices || []) {
        if (d.status === "pending") {
          pending.push({
            code: r.code,
            deviceId: d.deviceId,
            deviceInfo: d.deviceInfo,
            firstSeenAt: d.firstSeenAt,
            lastSeenAt: d.lastSeenAt,
          });
        }
      }
    }

    // newest first
    pending.sort((a, b) => new Date(b.lastSeenAt) - new Date(a.lastSeenAt));

    return res.status(200).json({ pending });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.approveDeviceByAdmin = async (req, res) => {
  try {
    const { code, deviceId } = req.body;

    if (!code || !deviceId) return res.status(400).json({ message: "code and deviceId required" });

    const reg = await DeviceRegistry.findOne({ code });
    if (!reg) return res.status(404).json({ message: "DeviceRegistry not found" });

    const d = reg.devices.find((x) => x.deviceId === deviceId);
    if (!d) return res.status(404).json({ message: "Device not found" });

    d.status = "approved";
    d.approvedAt = new Date();
    d.approvedByCode = req.user?.code || "admin";
    d.lastSeenAt = new Date();

    await reg.save();
    return res.status(200).json({ message: "Device approved", code, deviceId });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.blockDeviceByAdmin = async (req, res) => {
  try {
    const { code, deviceId } = req.body;
    if (!code || !deviceId) return res.status(400).json({ message: "code and deviceId required" });

    const reg = await DeviceRegistry.findOne({ code });
    if (!reg) return res.status(404).json({ message: "DeviceRegistry not found" });

    const d = reg.devices.find((x) => x.deviceId === deviceId);
    if (!d) return res.status(404).json({ message: "Device not found" });

    d.status = "blocked";
    d.lastSeenAt = new Date();
    await reg.save();

    // optional: revoke all active sessions for that code (immediate kick)
    await Session.updateMany({ code, status: "active" }, { $set: { status: "revoked", logoutTime: new Date() } });

    return res.status(200).json({ message: "Device blocked", code, deviceId });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.logoutSessionByAdmin = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const s = await Session.findById(sessionId);
    if (!s) return res.status(404).json({ message: "Session not found" });

    s.status = "revoked";
    s.logoutTime = new Date();
    await s.save();

    return res.status(200).json({ message: "Session logged out", sessionId });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.logoutAllSessionsByCode = async (req, res) => {
  try {
    const { code } = req.params;

    const result = await Session.updateMany(
      { code, status: "active" },
      { $set: { status: "revoked", logoutTime: new Date() } }
    );

    return res.status(200).json({
      message: "All sessions revoked",
      code,
      matched: result?.matchedCount ?? result?.n ?? 0,
      modified: result?.modifiedCount ?? result?.nModified ?? 0,
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.getSessions = async (req, res) => {
  try {
    const { code, status } = req.query;

    const filter = {};
    if (code) filter.code = code;
    if (status) filter.status = status;

    const sessions = await Session.find(filter).sort({ createdAt: -1 }).limit(200);
    return res.status(200).json({ sessions });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};


// device and sessions 


exports.getDevicesAndSessions = async (req, res) => {
  try {
    const {
      code,
      search = "",
      deviceStatus,
      sessionStatus,
      page = 1,
      limit = 20,
    } = req.query;

    const query = {};

    if (code) query.code = code;
    if (search) {
      query.code = { $regex: search, $options: "i" };
    }

    const registries = await DeviceRegistry.find(query)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    const codes = registries.map((r) => r.code);

    // fetch users
    const users = await User.find({ code: { $in: codes } })
      .select("name code role position")
      .lean();

    const userMap = {};
    users.forEach((u) => {
      userMap[u.code] = u;
    });

    // fetch sessions (latest first)
    const sessions = await Session.find({ code: { $in: codes } })
      .sort({ loginTime: -1 })
      .lean();

    // group sessions by code + deviceId
    const sessionMap = {};
    sessions.forEach((s) => {
      const key = `${s.code}_${s.deviceId}`;
      if (!sessionMap[key]) sessionMap[key] = [];
      sessionMap[key].push(s);
    });

    const result = registries.map((reg) => {
      const user = userMap[reg.code] || {};

      const devices = (reg.devices || []).map((d) => {
        const key = `${reg.code}_${d.deviceId}`;
        let deviceSessions = sessionMap[key] || [];

        // filter session status if needed
        if (sessionStatus) {
          deviceSessions = deviceSessions.filter(
            (s) => s.status === sessionStatus
          );
        }

        return {
          ...d,
          sessions: deviceSessions, // newest already first
        };
      });

      // filter device status if needed
      const filteredDevices = deviceStatus
        ? devices.filter((d) => d.status === deviceStatus)
        : devices;

      return {
        code: reg.code,
        user: {
          name: user.name || "",
          role: user.role || "",
          position: user.position || "",
        },
        devices: filteredDevices,
        updatedAt: reg.updatedAt,
      };
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("GET_DEVICES_ERROR", error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.deleteDevice = async (req, res) => {
  try {
    const { code, deviceId } = req.body;

    if (!code || !deviceId) {
      return res.status(400).json({ message: "code and deviceId required" });
    }

    const reg = await DeviceRegistry.findOne({ code });

    if (!reg) {
      return res.status(404).json({ message: "Device registry not found" });
    }

    reg.devices = reg.devices.filter(
      (d) => d.deviceId !== deviceId
    );

    await reg.save();

    return res.status(200).json({
      success: true,
      message: "Device deleted successfully",
    });
  } catch (error) {
    console.error("DELETE_DEVICE_ERROR", error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.updateDeviceStatus = async (req, res) => {
  try {
    const { code, deviceId, status } = req.body;

    if (!code || !deviceId || !status) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const reg = await DeviceRegistry.findOne({ code });

    if (!reg) {
      return res.status(404).json({ message: "Not found" });
    }

    const device = reg.devices.find(
      (d) => d.deviceId === deviceId
    );

    if (!device) {
      return res.status(404).json({ message: "Device not found" });
    }

    device.status = status;

    await reg.save();

    return res.status(200).json({
      success: true,
      message: "Device status updated",
    });
  } catch (error) {
    console.error("UPDATE_DEVICE_ERROR", error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.revokeSession = async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ message: "sessionId required" });
    }

    await Session.findByIdAndUpdate(sessionId, {
      status: "revoked",
      logoutTime: new Date(),
    });

    return res.status(200).json({
      success: true,
      message: "Session revoked",
    });
  } catch (error) {
    console.error("REVOKE_SESSION_ERROR", error);
    return res.status(500).json({ message: "Server error" });
  }
};