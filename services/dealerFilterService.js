const DealerHierarchy = require("../model/DealerHierarchy");

exports.getDealerCodesFromFilters = async (filters) => {
  if (!filters || Object.keys(filters).length === 0) {
    return null;
  }

  const query = {};

  Object.keys(filters).forEach((key) => {
    if (filters[key] && filters[key].length > 0) {
      query[key] = { $in: filters[key] };
    }
  });

  if (Object.keys(query).length === 0) return null;

  const dealers = await DealerHierarchy.find(query).select("dealer_code");

  return dealers.map((d) => d.dealer_code);
};
