const mongoose = require('mongoose');

const BranchSchema = new mongoose.Schema({
  branch: {
    type: String,
    required: true,
    trim: true
  }
}, {timestamps: true});

module.exports = mongoose.model('Branch', BranchSchema);
