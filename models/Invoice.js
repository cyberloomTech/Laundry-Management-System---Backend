const mongoose = require('mongoose');

const InvoiceSchema = new mongoose.Schema({
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  ncf: {
    type: String
  },
  location: {
    type: String
  },
  itbis: {
    type: Number,
    default: 0
  },
  discount: {
    type: Number,
    default: 0
  },
  total: {
    type: Number,
    required: true
  },
  paid: {
    type: Number,
    default: 0
  },
  remain:{
    type: Number
  },
  cash_amount: {
    type: Number
  },
  card_amount: {
    type: Number
  },
  bank_tranfer_amount: {
    type: Number
  },
  delivery_date: {
    type: Date
  }
}, {timestamps: true});

module.exports = mongoose.model('Invoice', InvoiceSchema);
