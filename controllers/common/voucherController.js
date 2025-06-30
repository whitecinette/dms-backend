const RoutePlan = require("../../model/RoutePlan");
const Voucher = require("../../model/Voucher");


exports.generateVoucher = async (req, res) => {
 try {
   const { code } = req.user;

   // 1. Get today's date range
   const today = new Date();
   const startOfDay = new Date(today.setHours(0, 0, 0, 0));
   const endOfDay = new Date(today.setHours(23, 59, 59, 999));

   // 2. Check if a RoutePlan exists for today
   const routePlan = await RoutePlan.findOne({
     userCode: code,
     date: { $gte: startOfDay, $lte: endOfDay },
   });

   if (!routePlan) {
     return res.status(404).json({
       success: false,
       message: "No route plan found for today.",
     });
   }

   // 3. Check if voucher already exists for this routePlan
   const existingVoucher = await Voucher.findOne({
     userCode: code,
     routePlanId: routePlan._id,
   });

   if (existingVoucher) {
     return res.status(400).json({
       success: false,
       message: "Voucher already generated for today's route.",
     });
   }

   // 4. Use distance and calculate amount
   const distance = routePlan.distanceInKm;
   const calculatedAmount = distance * VARS.RATE_PER_KM;

   // 5. Create voucher
   const voucher = await Voucher.create({
     userCode: code,
     routePlanId: routePlan._id,
     from: routePlan.from,
     to: routePlan.to,
     distanceInKm: distance,
     ratePerKm: VARS.RATE_PER_KM,
     calculatedAmount,
     date: new Date(),
   });

   return res.status(201).json({
     success: true,
     message: "Voucher generated successfully.",
     data: voucher,
   });

 } catch (error) {
   console.error("Error generating voucher:", error);
   return res.status(500).json({
     success: false,
     message: "Something went wrong while generating voucher.",
   });
 }
};

exports.getVoucherStatusByDateRange = async (req, res) => {
 try {
   const { code } = req.user;
   const { from, to } = req.query;

   const fromDate = new Date(from);
   const toDate = new Date(to);

   const routePlans = await RoutePlan.find({
     userCode: code,
     date: { $gte: fromDate, $lte: toDate },
   });

   const vouchers = await Voucher.find({
     userCode: code,
     date: { $gte: fromDate, $lte: toDate },
   });

   const result = routePlans.map((plan) => {
     const voucher = vouchers.find(v => (
       v.routePlanId.toString() === plan._id.toString()
     ));

     return {
       date: plan.date.toISOString().slice(0, 10),
       route: `${plan.from} to ${plan.to}`,
       voucherStatus: voucher ? "Generated" : "Not Generated",
       canGenerate: !voucher,
       voucherId: voucher?._id || null,
     };
   });

   res.json({ success: true, data: result });

 } catch (error) {
   console.error("Voucher status fetch error:", error);
   res.status(500).json({ success: false, message: "Internal error" });
 }
};

exports.getRoutePlansToGenerateVoucher = async (req, res) => {
 try {
   const { code } = req.user; // userCode from token
   const { from, to } = req.query;

   let filter = { userCode: code };

   // Optional date range filter
   if (from && to) {
     filter.date = {
       $gte: new Date(new Date(from).setHours(0, 0, 0, 0)),
       $lte: new Date(new Date(to).setHours(23, 59, 59, 999)),
     };
   } else {
     // Default: today’s route plan only
     const today = new Date();
     filter.date = {
       $gte: new Date(today.setHours(0, 0, 0, 0)),
       $lte: new Date(today.setHours(23, 59, 59, 999)),
     };
   }

   const plans = await RoutePlan.find(filter).sort({ date: -1 });

   res.status(200).json({
     success: true,
     message: "Route plans fetched successfully.",
     data: plans,
   });

 } catch (error) {
   console.error("Error fetching route plans:", error);
   res.status(500).json({
     success: false,
     message: "Internal Server Error.",
   });
 }
};