const Travel = require("../../model/Travel");
const moment = require("moment");
const fsPromises = require("fs/promises");
const cloudinary = require("../../config/cloudinary");
const ActorCode = require("../../model/ActorCode");
const User = require("../../model/User");
const { emitWarning } = require("process");
const path = require("path");

exports.uploadBills = async (req, res) => {
  try {
    const { code } = req.user;
    const { billType, isGenerated, remarks, amount } = req.body;

    if (!req.files || req.files.length === 0) {
      return res
        .status(400)
        .json({ message: "At least one bill file is required" });
    }
    const typeAbbr =
    {
      Restaurant: "RS",
      Travel: "TR",
      Hotel: "HT",
      Transport: "TP",
      Fuel: "FL",
      Other: "OT",
    }[billType] || "OT";
  const datePart = moment().format("DMM");
  const ran = Math.floor(10 + Math.random() * 90);
  const billNumber = `${typeAbbr}-${code}-${datePart}${ran}`;
    const uploadedBills = await Promise.all(
      req.files.map((file) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const timestamp = moment().format("YYYY-MM-DD_HH-mm-ss");
        const publicId = `${code}_${timestamp}_${Math.floor(
          Math.random() * 1000
        )}`;

        // Determine the resource type
        let resourceType = "image"; // default
        if (ext === ".pdf") resourceType = "raw";

        return cloudinary.uploader.upload(file.path, {
          resource_type: resourceType,
          folder: "Travel Bills",
          public_id: publicId,
          transformation:
            resourceType === "image"
              ? [
                  { width: 800, height: 800, crop: "limit" },
                  { quality: "auto" },
                  { fetch_format: "auto" },
                ]
              : undefined,
        });
      })
    );

    const fileUrls = uploadedBills.map((result) => result.secure_url);
 
    const newBill = new Travel({
      billNumber,
      billType,
      billImages: fileUrls,
      amount: amount,
      isGenerated: isGenerated || false,
      remarks: remarks || "",
      code: code,
    });

    await newBill.save();

    return res.status(201).json({
      message: "Bills uploaded successfully",
      bill: newBill,
    });
  } catch (error) {
    console.error("Error in bill upload", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

exports.getTravelBills = async (req, res) => {
  try {
    const { role } = req.user;
    let {
      search,
      status,
      billType,
      fromDate,
      toDate,
      page = 1,
      limit = 10,
    } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);
    const skip = (page - 1) * limit;

    const query = {};

    // HR can only see employee bills
    if (role === "hr") {
      const employees = await User.find({ role: "employee" }, "code").lean();
      const employeeCodes = employees.map((emp) => emp.code);
      query.code = { $in: employeeCodes };
    }

    // Apply filters
    if (status) query.status = status;
    if (billType) query.billType = billType;
    if (fromDate && toDate) {
      query.createdAt = {
        $gte: new Date(fromDate),
        $lte: new Date(toDate),
      };
    }

    // Get total records
    const totalCount = await Travel.countDocuments(query);

    // Fetch paginated bills
    const bills = await Travel.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Add employee name from ActorCode
    let formattedBills = await Promise.all(
      bills.map(async (bill) => {
        const actor = await ActorCode.findOne(
          { code: bill.code },
          "name"
        ).lean();
        return {
          ...bill,
          employeeName: actor?.name || "Unknown",
          employeeCode: bill.code,
        };
      })
    );

    // Post-pagination search (optional)
    if (search) {
      formattedBills = formattedBills.filter(
        (bill) =>
          bill.employeeName?.toLowerCase().includes(search.toLowerCase()) ||
          bill.employeeCode?.toLowerCase().includes(search.toLowerCase())
      );
    }

    res.status(200).json({
      success: true,
      message: "Travel bills retrieved successfully",
      currentPage: page,
      totalPages: Math.ceil(totalCount / limit),
      totalRecords: totalCount,
      bills: formattedBills,
    });
  } catch (error) {
    console.error("Error retrieving travel bills:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

exports.getBillsForEmp = async (req, res) => {
  try {
    const { code } = req.user;
    const { startDate, status } = req.query;

    // Build dynamic filter
    const filter = { code };

    // Add status filter if provided
    if (status) {
      filter.status = status;
    }

    // Add date range filter if provided
    if (startDate) {
      const start = new Date(startDate);
      start.setUTCHours(0, 0, 0, 0);

      const nextDay = new Date(start);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      nextDay.setUTCHours(0, 0, 0, 0);

      filter.createdAt = {
        $gte: start,
        $lt: nextDay,
      };
    }

    // 1. Fetch filtered bills
    const bills = await Travel.find(filter).sort({ createdAt: -1 });

    // 2. Fetch employee name from ActorCode collection
    const actor = await ActorCode.findOne({ code }, { name: 1, _id: 0 });

    return res.status(200).json({
      message: "Bills fetched successfully",
      employee: {
        code,
        name: actor?.name || "N/A",
      },
      bills,
    });
  } catch (error) {
    console.error("Error getting bills for employee:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

exports.editTravelBill = async (req, res) => {
  try {
    const { status, amount } = req.body;
    const { id } = req.params;

    // Validate required inputs
    if (!status || !id) {
      return res.status(400).json({
        success: false,
        status: "error",
        message: "Status and ID are required",
      });
    }

    if (status === "pending") {
      return res.status(400).json({
        success: false,
        status: "warning",
        message: "Cannot change status to pending",
      });
    }

    // Prepare update object
    const updateData = {
      status,
      updatedAt: new Date(),
    };

    // Add amount to update only if it's provided and valid
    if (amount !== undefined) {
      if (isNaN(amount)) {
        return res.status(400).json({
          success: false,
          status: "error",
          message: "Amount must be a valid number",
        });
      }
      updateData.amount = amount;
    }

    // Find and update in one operation
    const bill = await Travel.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!bill) {
      return res.status(404).json({
        success: false,
        status: "error",
        message: "Travel bill not found",
      });
    }

    return res.status(200).json({
      success: true,
      status: "success",
      message: "Travel bill updated successfully",
      data: bill,
    });
  } catch (error) {
    console.error("Error editing travel bill:", error);
    return res.status(500).json({
      success: false,
      status: "error",
      message: "Internal server error",
    });
  }
};
