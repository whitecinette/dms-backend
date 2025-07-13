const PayrollPolicy = require("../../model/PayrollPolicy");

exports.addPayrollPolicies = async (req, res) => {
  try {
    const { state, pf, esi } = req.body;
    if (!state) return res.status(400).json({ message: "State is required" });

    const updated = await PayrollPolicy.findOneAndUpdate(
      { state },
      { pf, esi },
      { new: true, upsert: true }
    );

    res.status(200).json({ message: "Policy config saved", data: updated });
  } catch (err) {
    console.error("Policy config error:", err);
    res.status(500).json({ message: "Internal error", error: err.message });
  }
};

exports.getAllPolicyConfigs = async (req, res) => {
  try {
    const configs = await PayrollPolicy.find();
    res.status(200).json({ data: configs });
  } catch (err) {
    res.status(500).json({ message: "Error fetching configs", error: err.message });
  }
};
