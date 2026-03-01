const DeviceRegistry = require("../../model/DeviceRegistry");


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