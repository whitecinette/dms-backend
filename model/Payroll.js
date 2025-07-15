const mongoose = require("mongoose");

const payrollSchema = new mongoose.Schema(
  {
    // 🎯 Unique Employee Code (ref to ActorCode or User)
    code: {
      type: String,
      ref: "ActorCode", // Or "User" if you're using User collection
      required: true,
    },

    // 📅 Month for which salary is being generated (e.g., "2025-07")
    salaryMonth: {
      type: String,
      required: true,
    },

    // 🕒 Date when payroll was generated
    payrollDate: {
      type: Date,
      default: Date.now,
    },

    // 💰 Date when salary was actually paid
    salaryPaidAt: {
      type: Date,
    },

    // 📆 Total salary days in the month (e.g., 26 working days out of 30)
    salaryDays: {
      type: Number,
      required: true,
    },

    // ✅ Attendance-based working days (Present + 0.5 × Half Days + Paid Leaves)
    workingDaysCounted: {
      type: Number,
      required: true,
    },
    carryForward: {
     pendingSalary: Number,
     unpaidExpenses: Number,
     remarks: String,
   },   
    // 🧾 Salary Components
    salaryDetails: {
      baseSalary: { type: Number, required: true }, // Monthly snapshot from CTC/12

      bonuses: [
       {
         name: { type: String },
         type: { type: String, enum: ["percentage", "fixed"], required: true },
         amount: { type: Number, default: 0 },
         value: { type: Number }, // optional % value
         baseOn: {
           type: String,
           enum: ["baseSalary", "ctc"],
           default: "baseSalary",
         },
       },
     ],

     deductions: [
      {
        name: { type: String, required: true },
        type: { type: String, enum: ["percentage", "fixed"], required: true },
        value: { type: Number, required: true },
        baseOn: {
          type: String,
          enum: ["baseSalary", "ctc"],
          default: "baseSalary",
        },
        isActive: { type: Boolean, default: false },
      },
    ],
    increments: [
     {
       name: String,
       amount: Number,
       value: Number, // optional % value
       type: { type: String, enum: ["permanent", "one-time"] },
       baseOn: {
         type: String,
         enum: ["baseSalary", "ctc", "calculatedSalary"],
         default: "calculatedSalary",
       },
       effectiveFrom: Date,
       approvedBy: { type: String, ref: "User" },
     },
   ], 

   other: [
    {
      name: { type: String, required: true },
      category: { type: String, enum: ["addition", "deduction"], required: true }, // renamed to avoid confusion with 'type' of value
      type: { type: String, enum: ["percentage", "fixed"], required: true },
      value: { type: Number, required: true }, // value can be % or fixed amount depending on `type`
      isActive: { type: Boolean, default: false },
      baseOn: { type: String, enum: ["baseSalary", "ctc"], default: "baseSalary" }, // optional, if needed
    },
  ],
  

      reimbursedExpenses: {
        type: Number,
        default: 0,
      },
    },

    // 🧮 Final Computed Values (after all calculations)
    calculatedSalary: { type: Number },   // Raw salary before bonuses/deductions
    grossPay: { type: Number },           // base + bonuses + additions
    totalDeductions: { type: Number },    // All fixed & percentage deductions + other deductions
    netPayable: { type: Number },         // Final payout after deductions

    // 📌 Metadata
    status: {
      type: String,
      enum: ["Generated", "Pending", "Paid"],
      default: "Generated",
    },

    createdBy: {
      type: String,
      ref: "User",
    },

    remarks: {
      type: String,
    },
    // to store payslip url for salary generted 
    payslipUrl: {
     type: String
   }
   

  },
  { timestamps: true, strict: false }
);
module.exports = mongoose.model("Payroll", payrollSchema);