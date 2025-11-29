const mongoose = require('mongoose');

const BackupConfigSchema = new mongoose.Schema({
  autoBackupEnabled: {
    type: Boolean,
    default: false
  },
  backupInterval: {
    type: Number, // in hours
    default: 24
  },
  backupPath: {
    type: String,
    default: '../backups'
  },
  lastBackupTime: {
    type: Date,
    default: null
  },
  nextBackupTime: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('BackupConfig', BackupConfigSchema);
