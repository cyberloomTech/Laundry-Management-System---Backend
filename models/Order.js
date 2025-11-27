const mongoose = require('mongoose');
const Counter = require('./Counter');

const OrderSchema = new mongoose.Schema({
  order_code: {
    type: Number,
    unique: true
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },
  items: [{
    item: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Item',
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1
    },
    color: {
      type: String
    },
    service: [{
      type: String,
      enum: ['wash', 'iron', 'repair']
    }],
    price: {
      type: Number,
      required: true,
      min: 0
    }
  }],
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['received', 'completed', 'delivered'],
    default: 'received'
  },
  paid: {
    type: Number,
    default: 0
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  estimated_delivery: {
    type: Date
  }
}, { timestamps: true });

OrderSchema.pre('save', async function () {
  if (this.isNew) {
    const counter = await Counter.findOneAndUpdate(
      { name: 'order_code' }, // unique counter for Order
      { $inc: { value: 1 } },
      { new: true, upsert: true }
    );
    this.order_code = counter.value;
  }
});

module.exports = mongoose.model('Order', OrderSchema);
