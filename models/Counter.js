const mongoose = require('mongoose');

const CounterSchema = new mongoose.Schema({
  name: {
    type: String,
    unique: true
  },
  value: {
    type: Number,
    default: 0
  }
}, {timestamps: true});

module.exports = mongoose.model('Counter', CounterSchema);
