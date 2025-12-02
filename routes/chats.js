const express = require('express');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// CREATE - Start a direct chat between two users
router.post('/direct', async (req, res) => {
  try {
    const { recipientId } = req.body;

    if (!recipientId) {
      return res.status(400).json({ error: 'Recipient ID is required' });
    }

    // Check if recipient exists
    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({ error: 'Recipient not found' });
    }

    // Check if chat already exists between these users
    const existingChat = await Chat.findOne({
      chatType: 'direct',
      participants: { $all: [req.user._id, recipientId] }
    });

    if (existingChat) {
      return res.json({
        message: 'Chat already exists',
        chat: existingChat
      });
    }

    // Create new direct chat
    const chat = new Chat({
      chatType: 'direct',
      participants: [req.user._id, recipientId]
    });

    await chat.save();
    await chat.populate({
      path: 'participants',
      select: 'name role branch',
      populate: { path: 'branch' }
    });
    await chat.populate('lastMessage');

    // Emit new chat creation to participants via Socket.IO
    const io = req.app.get('io');
    if (io) {
      // Notify the recipient (not the creator)
      const recipientSocketId = `user_${recipientId}`;
      io.to(recipientSocketId).emit('new_chat', {
        chat: {
          _id: chat._id,
          chatType: chat.chatType,
          participants: chat.participants,
          createdAt: chat.createdAt,
          lastActivity: chat.lastActivity
        }
      });
    }

    res.status(201).json({
      message: 'Direct chat created successfully',
      chat
    });
  } catch (error) {
    console.error('Create direct chat error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// CREATE - Join branch chat (auto-created if doesn't exist)
router.post('/branch', async (req, res) => {
  try {
    const userBranch = req.user.branch;

    if (!userBranch) {
      return res.status(400).json({ error: 'User must belong to a branch to join branch chat' });
    }

    // Check if branch chat already exists
    let branchChat = await Chat.findOne({
      chatType: 'branch',
      branch: userBranch
    });

    if (!branchChat) {
      // Create branch chat if it doesn't exist
      branchChat = new Chat({
        chatType: 'branch',
        branch: userBranch,
        participants: [req.user._id]
      });
    } else {
      // Add user to participants if not already there
      if (!branchChat.participants.includes(req.user._id)) {
        branchChat.participants.push(req.user._id);
      }
    }

    await branchChat.save();
    await branchChat.populate({
      path: 'participants',
      select: 'name role branch',
      populate: { path: 'branch' }
    });
    await branchChat.populate('branch');
    await branchChat.populate('lastMessage');

    res.json({
      message: 'Joined branch chat successfully',
      chat: branchChat
    });
  } catch (error) {
    console.error('Join branch chat error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// CREATE - Join admin chat (only for admins and users who want to contact admin)
router.post('/admin', async (req, res) => {
  try {
    // Check if admin chat already exists
    let adminChat = await Chat.findOne({
      chatType: 'admin'
    });

    if (!adminChat) {
      // Create admin chat if it doesn't exist
      adminChat = new Chat({
        chatType: 'admin',
        participants: [req.user._id]
      });
    } else {
      // Add user to participants if not already there
      if (!adminChat.participants.includes(req.user._id)) {
        adminChat.participants.push(req.user._id);
      }
    }

    await adminChat.save();
    await adminChat.populate({
      path: 'participants',
      select: 'name role branch',
      populate: { path: 'branch' }
    });
    await adminChat.populate('lastMessage');

    res.json({
      message: 'Joined admin chat successfully',
      chat: adminChat
    });
  } catch (error) {
    console.error('Join admin chat error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// READ - Get all user's chats
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const chats = await Chat.find({
      participants: req.user._id,
      isActive: true
    })
    .populate({
      path: 'participants',
      select: 'name role branch avatar',
      populate: { path: 'branch' }
    })
    .populate('branch')
    .populate('lastMessage')
    .sort({ lastActivity: -1 })
    .skip(skip)
    .limit(parseInt(limit));

    // Calculate unread count for each chat
    const chatsWithUnread = await Promise.all(chats.map(async (chat) => {
      const unreadCount = await Message.countDocuments({
        chat: chat._id,
        sender: { $ne: req.user._id },
        'readBy.user': { $ne: req.user._id }
      });
      
      return {
        ...chat.toObject(),
        unreadCount
      };
    }));

    const total = await Chat.countDocuments({
      participants: req.user._id,
      isActive: true
    });

    res.json({
      chats: chatsWithUnread,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get chats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// READ - Get single chat by ID
router.get('/:id', async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.id)
      .populate({
        path: 'participants',
        select: 'name role branch',
        populate: { path: 'branch' }
      })
      .populate('branch')
      .populate('lastMessage');

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    // Check if user is participant in this chat
    if (!chat.participants.some(p => p._id.toString() === req.user._id.toString())) {
      return res.status(403).json({ error: 'Access denied. You are not a participant in this chat.' });
    }

    res.json({ chat });
  } catch (error) {
    console.error('Get chat error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ error: 'Invalid chat ID' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// UPDATE - Leave chat (for direct chats, mark as inactive)
router.put('/:id/leave', async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.id);

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    // Check if user is participant
    if (!chat.participants.includes(req.user._id)) {
      return res.status(403).json({ error: 'You are not a participant in this chat' });
    }

    if (chat.chatType === 'direct') {
      // For direct chats, just remove the user from participants
      chat.participants = chat.participants.filter(p => p.toString() !== req.user._id.toString());
      
      // If no participants left, mark as inactive
      if (chat.participants.length === 0) {
        chat.isActive = false;
      }
    } else {
      // For branch and admin chats, just remove user from participants
      chat.participants = chat.participants.filter(p => p.toString() !== req.user._id.toString());
    }

    await chat.save();

    res.json({
      message: 'Left chat successfully',
      chat
    });
  } catch (error) {
    console.error('Leave chat error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ error: 'Invalid chat ID' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE - Delete chat and all its messages
router.delete('/:id', async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.id);

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    // Check if user is participant
    if (!chat.participants.includes(req.user._id)) {
      return res.status(403).json({ error: 'You are not a participant in this chat' });
    }

    // Delete all messages in the chat
    await Message.deleteMany({ chat: req.params.id });

    // Delete the chat
    await Chat.findByIdAndDelete(req.params.id);

    // Emit chat deletion to all participants via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.to(`chat_${req.params.id}`).emit('chat_deleted', {
        chatId: req.params.id
      });
    }

    res.json({
      message: 'Chat and all messages deleted successfully',
      chatId: req.params.id
    });
  } catch (error) {
    console.error('Delete chat error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ error: 'Invalid chat ID' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;