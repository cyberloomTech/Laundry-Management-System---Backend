const mongoose = require('mongoose');

const ChatSchema = new mongoose.Schema({
  chatType: {
    type: String,
    enum: ['direct', 'branch', 'admin'],
    required: true
  },
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  branch: {
    type: String,
    // Only required for branch chats
    required: function() {
      return this.chatType === 'branch';
    }
  },
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

module.exports = mongoose.model('Chat', ChatSchema);