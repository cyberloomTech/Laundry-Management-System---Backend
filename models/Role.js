const mongoose = require('mongoose');

const RoleSchema = new mongoose.Schema({
  roleName: {
    type: String
  },
  permission: [{
    type: String,
    enum: ['order', 'status', 'customer', 'price', 'receipt', 'user', 'configuration'],
    trim: true,
    default: []
  }]
}, {timestamps: true});

module.exports = mongoose.model('Role', RoleSchema);
