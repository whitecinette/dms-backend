const mongoose = require("mongoose");

const financeVoucherSchema = new mongoose.Schema(
  {
    code: String,
    name: String,
    voucherName: String,
    voucherType: String, // "Invoice", "Credit Note", "Debit Note"
    invoiceNumber: String,
    partyName: String,
    date: String,
    dateISO: Date,
    dueDate: String,
    dueDateISO: Date,
    dueDays: Number,
    invoiceAmount: Number,
    pendingAmount: Number,
    isCredit: Boolean, // true = Cr, false = Dr
    remarks: String, // Overdue, Today Due, Upcoming Dues
    overDueDays: Number
  },
  { timestamps: true, strict: false }
);

module.exports = mongoose.model("FinanceVoucher", financeVoucherSchema);
