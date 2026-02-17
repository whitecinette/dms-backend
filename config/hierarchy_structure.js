const HIERARCHY_ORDER = [
  "sh_code",
  "zsm_code",
  "asm_code",
  "mdd_code",
  "tse_code",
  "dealer_code"
]

const POSITION_FIELD_MAP = {
  sh: "sh_code",
  zsm: "zsm_code",
  asm: "asm_code",
  mdd: "mdd_code",
  tse: "tse_code",
};

module.exports = {
  POSITION_FIELD_MAP,
  HIERARCHY_ORDER
}