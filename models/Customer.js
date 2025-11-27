const mongoose = require('mongoose');
const Counter = require('./Counter'); 

const CustomerSchema = new mongoose.Schema({
  customer_code: {
    type: Number,
    unique: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    trim: true
  },
  phone2: {
    type: String,
    trim: true
  },
  address: {
    type: String
  },
  email: {
    type: String
  },
  rnc: {
    type: String
  },
  note: {
    type: String
  }
}, {timestamps: true});

CustomerSchema.pre('save', async function() {
  if (this.isNew) {
    const counter = await Counter.findOneAndUpdate(
      { name: 'customer_code' }, // unique counter for Customer
      { $inc: { value: 1 } },
      { new: true, upsert: true }
    );
    this.customer_code = counter.value;
  }
});

module.exports = mongoose.model('Customer', CustomerSchema);
