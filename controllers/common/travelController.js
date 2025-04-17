const Travel = require("../../model/Travel");

exports.scheduleTravel = async (req, res) => {
 try {
   const { code } = req.user;

   const {
     travelDate,
     locations, 
     purpose,
     modeOfTransport,
     returnDate,
   } = req.body;

   if (!Array.isArray(locations) || locations.length < 2) {
     return res.status(400).json({
       message: "At least two locations are required (start and end)."
     });
   }

   const newTravel = new Travel({
     code,
     travelDate,
     locations,
     purpose,
     modeOfTransport,
     returnDate,
   });

   await newTravel.save();

   res.status(201).json({
     message: "Travel scheduled successfully",
     travel: newTravel,
   });
 } catch (error) {
   console.error("Schedule travel error:", error);
   res.status(500).json({ message: "Failed to schedule travel" });
 }
}; 

exports.getAllTravelSchedule = async (req, res) => {
 try {

   const travelData = await Travel.find({ }).sort({ travelDate: -1 });

   res.status(200).json({
     message: "Travel data fetched successfully",
     travelData,
   });
 } catch (error) {
   console.log("Get Travel error:", error);
   res.status(500).json({ message: "Failed to fetch travel data" });
 }
};