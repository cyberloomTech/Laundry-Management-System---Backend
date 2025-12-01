const mongoose = require('mongoose');

const ItemSchema = new mongoose.Schema({
  itemName: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    enum: ['clothing', 'home', 'accessories', 'other'],
    trim: true
  },
  wash: {
    type: Number,
    default: 0,
    min: 0
  },
  iron: {
    type: Number,
    default: 0,
    min: 0
  },
  repair: {
    type: Number,
    default: 0,
    min: 0
  },
  itemImage: {
    type: String,
    default: null
  }
}, {timestamps: true});

module.exports = mongoose.model('Item', ItemSchema);
