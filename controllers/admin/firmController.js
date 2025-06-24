const { v4: uuidv4 } = require("uuid");
const Firm = require("../../model/Firm");
const { generateFirmId } = require("../../helpers/adminHelpers");
const Organization = require("../../model/Organization");
const ActorTypesHierarchy = require("../../model/ActorTypesHierarchy");

// 📌 Create a new Firm
exports.createFirm = async (req, res) => {
    try {
        const { name, owners, gstNumber, logo, address, contact, accountDetails, website } = req.body;

        // Check if Firm already exists
        const existingFirm = await Firm.findOne({ gstNumber });
        if (existingFirm) {
            return res.status(400).json({ message: "Firm with this GST number already exists" });
        }

        // Ensure at least one owner is provided
        if (!owners || owners.length === 0) {
            return res.status(400).json({ message: "At least one owner is required" });
        }

        // Generate short & unique firmId from name
        const firmId = await generateFirmId(name);

        // Create Firm
        const firm = new Firm({
            firmId,
            name,
            owners,
            gstNumber,
            logo,
            address,
            contact,
            accountDetails,
            website,
        });

        await firm.save();
        res.status(201).json({ message: "Firm created successfully", firm });
    } catch (error) {
        res.status(500).json({ message: "Server Error", error });
        console.log("rerrro" , error)
    }
};


// 📌 Get all Firms
exports.getAllFirms = async (req, res) => {
    try {
        const firms = await Firm.find();
        res.status(200).json(firms);
    } catch (error) {
        res.status(500).json({ message: "Server Error", error });
    }
};

// 📌 Get a Firm by firmId
exports.getFirmById = async (req, res) => {
    try {
        const firm = await Firm.findOne({ firmId: req.params.firmId });

        if (!firm) {
            return res.status(404).json({ message: "Firm not found" });
        }

        res.status(200).json(firm);
    } catch (error) {
        res.status(500).json({ message: "Server Error", error });
    }
};

// 📌 Update a Firm
exports.updateFirm = async (req, res) => {
    try {
        const firm = await Firm.findOne({ firmId: req.params.firmId });

        if (!firm) {
            return res.status(404).json({ message: "Firm not found" });
        }

        // Update firm details
        Object.assign(firm, req.body);

        await firm.save();
        res.status(200).json({ message: "Firm updated successfully", firm });
    } catch (error) {
        res.status(500).json({ message: "Server Error", error });
    }
};

// 📌 Delete a Firm
exports.deleteFirm = async (req, res) => {
    try {
        const firm = await Firm.findOneAndDelete({ firmId: req.params.firmId });

        if (!firm) {
            return res.status(404).json({ message: "Firm not found" });
        }

        res.status(200).json({ message: "Firm deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: "Server Error", error });
    }
};

// created by nameera
exports.createFirms = async (req, res) => {
 try {
   const {
     name,
     orgName,
     description,
     branding,
     config,
     hierarchyTypeNames = [],
     owners,
     gstNumber,
     logo,
     address,
     contact,
     accountDetails,
     website,
     registrationDate,
     status
   } = req.body;

   // 🔍 Find org by name
   const org = await Organization.findOne({ name: orgName });
   if (!org) {
     return res.status(404).json({
       success: false,
       message: "Organization not found: " + orgName
     });
   }

   // 🔁 Check if firm with same name exists in this org
   const existingFirm = await Firm.findOne({ name, orgId: org._id });
   if (existingFirm) {
     return res.status(400).json({
       success: false,
       message: `Firm with name '${name}' already exists in organization '${orgName}'`
     });
   }

   // 🔍 Validate hierarchyTypeNames
   const flows = await ActorTypesHierarchy.find({ name: { $in: hierarchyTypeNames } });
   const foundFlowNames = flows.map(flow => flow.name);
   const invalidFlowNames = hierarchyTypeNames.filter(name => !foundFlowNames.includes(name));

   if (invalidFlowNames.length > 0) {
     return res.status(400).json({
       success: false,
       message: "Some hierarchyTypeNames are invalid",
       invalidFlows: invalidFlowNames
     });
   }

   // ✅ Generate firmId
   const firmId = await generateFirmId(name);

   // ✅ Create and save new firm
   const firm = new Firm({
     firmId,
     name,
     orgId: org._id,
     description,
     branding,
     config,
     owners,
     gstNumber,
     logo,
     address,
     contact,
     accountDetails,
     website,
     registrationDate,
     status,
     flowTypes: flows.map(flow => flow._id)
   });

   await firm.save();

   return res.status(201).json({
     success: true,
     message: "Firm created successfully",
     data: firm
   });

 } catch (error) {
   console.error("❌ Error creating firm:", error);
   return res.status(500).json({
     success: false,
     message: "Failed to create firm",
     error: error.message
   });
 }
};
exports.getFirms = async (req, res) => {
 try {
   const { orgName, orgId, firmName } = req.query;

   let filter = {};

   // 🔍 Filter by organization
   if (orgName) {
     const org = await Organization.findOne({ name: orgName });
     if (!org) {
       return res.status(404).json({
         success: false,
         message: "Organization not found: " + orgName
       });
     }
     filter.orgId = org._id;
   } else if (orgId) {
     filter.orgId = orgId;
   }

   // 🔍 Filter by firm name (case-insensitive, partial match)
   if (firmName) {
     filter.name = { $regex: firmName, $options: 'i' };
   }

   // 🔍 Fetch firms with populated references
   const firms = await Firm.find(filter)
     .populate('orgId', 'name')
     .populate('flowTypes', 'name')
     .lean();

   return res.status(200).json({
     success: true,
     message: "Firms fetched successfully",
     data: firms
   });

 } catch (error) {
   console.error("❌ Error fetching firms:", error);
   return res.status(500).json({
     success: false,
     message: "Failed to fetch firms",
     error: error.message
   });
 }
};


