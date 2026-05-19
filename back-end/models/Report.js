const mongoose = require('mongoose');

const reportItemSchema = new mongoose.Schema(
  {
    description: {
      type: String,
      required: [true, 'Item description is required'],
      trim: true,
      maxlength: 500,
    },
    subDescription: {
      type: String,
      trim: true,
      maxlength: 500,
      default: undefined,
    },
    hsn: {
      type: String,
      trim: true,
      maxlength: 50,
      default: '',
    },
    quantity: {
      type: Number,
      min: [0, 'Quantity cannot be negative'],
      default: undefined,
    },
    rate: {
      type: Number,
      min: [0, 'Rate cannot be negative'],
      default: undefined,
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0, 'Amount cannot be negative'],
    },
  },
  { _id: false }
);

const reportSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    date: {
      type: Date,
      required: [true, 'Date is required'],
      default: Date.now,
    },
    placeOfSupply: {
      type: String,
      required: [true, 'Place of supply is required'],
      trim: true,
      maxlength: 200,
    },
    client: {
      name: {
        type: String,
        required: [true, 'Client name is required'],
        trim: true,
        maxlength: 200,
      },
      address: {
        type: String,
        required: [true, 'Client address is required'],
        trim: true,
        maxlength: 1000,
      },
      gst: {
        type: String,
        required: [true, 'Client GST is required'],
        trim: true,
        maxlength: 50,
      },
    },
    items: {
      type: [reportItemSchema],
      validate: {
        validator: (items) => Array.isArray(items) && items.length > 0,
        message: 'At least one item is required',
      },
      required: true,
    },
    subtotal: {
      type: Number,
      required: true,
      min: [0, 'Subtotal cannot be negative'],
    },
    taxableSubtotal: {
      type: Number,
      min: [0, 'Taxable subtotal cannot be negative'],
      default: 0,
    },
    nonTaxableSubtotal: {
      type: Number,
      min: [0, 'Non-taxable subtotal cannot be negative'],
      default: 0,
    },
    cgst: {
      type: Number,
      required: true,
      min: [0, 'CGST cannot be negative'],
    },
    sgst: {
      type: Number,
      required: true,
      min: [0, 'SGST cannot be negative'],
    },
    total: {
      type: Number,
      required: true,
      min: [0, 'Total cannot be negative'],
    },
    status: {
      type: String,
      enum: ['Paid', 'Pending'],
      default: 'Pending',
      required: true,
    },
    bankDetails: {
      bankName: {
        type: String,
        required: [true, 'Bank name is required'],
        trim: true,
        maxlength: 200,
      },
      accountNumber: {
        type: String,
        required: [true, 'Account number is required'],
        trim: true,
        maxlength: 50,
      },
      ifsc: {
        type: String,
        required: [true, 'IFSC is required'],
        trim: true,
        maxlength: 20,
      },
    },
    declaration: {
      type: String,
      required: [true, 'Declaration is required'],
      trim: true,
      maxlength: 1000,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Report', reportSchema);
