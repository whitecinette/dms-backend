const applyFilters = (filters) => {
 let query = {};

 if (filters.search) {
     query.$or = [
         { name: { $regex: filters.search, $options: "i" } },  // Firm Name
         { "address.street": { $regex: filters.search, $options: "i" } }, // Address
         { "address.city": { $regex: filters.search, $options: "i" } },
         { "address.state": { $regex: filters.search, $options: "i" } },
         { "address.country": { $regex: filters.search, $options: "i" } },
         { "accountDetails.bankName": { $regex: filters.search, $options: "i" } }, // Bank Name
         { "accountDetails.branchName": { $regex: filters.search, $options: "i" } }
     ];
 }

 if (filters.startDate && filters.endDate) {
     query.createdAt = { 
         $gte: new Date(filters.startDate), 
         $lte: new Date(filters.endDate) 
     };
 }

 if (filters.status) {
     query.status = filters.status;
 }

 return query;
};

module.exports = applyFilters;
