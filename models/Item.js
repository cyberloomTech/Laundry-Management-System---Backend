const mongoose = require('mongoose');

const ItemSchema = new mongoose.Schema({
  itemType: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    enum: ['clothing', 'home', 'accessories'],
    trim: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  }
}, {timestamps: true});

module.exports = mongoose.model('Item', ItemSchema);
