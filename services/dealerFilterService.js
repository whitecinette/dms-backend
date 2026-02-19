const DealerHierarchy = require("../model/DealerHierarchy");
const { POSITION_FIELD_MAP } = require("../config/hierarchy_structure");

exports.getDealerCodesFromFilters = async (filters = {}, user) => {
  const query = {};

  // 🔐 1. Mandatory role restriction
  if (!["admin", "super_admin"].includes(user.role)) {
    const hierarchyField = POSITION_FIELD_MAP[user.position];

    if (hierarchyField) {
      query[hierarchyField] = user.code;
    }
  }

  // 🔎 2. Apply optional filters (within allowed scope)

  if (filters.sh?.length) {
    query.sh_code = { $in: filters.sh };
  }

  if (filters.zsm?.length) {
    query.zsm_code = { $in: filters.zsm };
  }

  if (filters.asm?.length) {
    query.asm_code = { $in: filters.asm };
  }

  if (filters.mdd?.length) {
    query.mdd_code = { $in: filters.mdd };
  }

  if (filters.tse?.length) {
    query.tse_code = { $in: filters.tse };
  }

  // 🔥 IMPORTANT CHANGE: include beat_code
  const dealers = await DealerHierarchy.find(query).select(
    "dealer_code mdd_code beat_code"
  );

  return {
    dealerCodes: dealers.map((d) => d.dealer_code),

    // 🔥 SECONDARY FIX:
    // Secondary.mdd_code actually matches dealerhierarchies.beat_code
    mddCodes: [...new Set(dealers.map((d) => d.beat_code))],
  };
};
