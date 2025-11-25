const express = require('express');
const Message = require('../models/Message');
const Chat = require('../models/Chat');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// CREATE - Send a message
router.post('/', async (req, res) => {
  try {
    const { chatId, message, messageType = 'text' } = req.body;

    if (!chatId || !message) {
      return res.status(400).json({ error: 'Chat ID and message are required' });
    }

    // Check if chat exists and user is participant
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    if (!chat.participants.includes(req.user._id)) {
      return res.status(403).json({ error: 'You are not a participant in this chat' });
    }

    // Create message
    const newMessage = new Message({
      chat: chatId,
      sender: req.user._id,
      message,
      messageType
    });

    await newMessage.save();
    await newMessage.populate('sender', 'name role branch');

    // Update chat's last message and activity
    chat.lastMessage = newMessage._id;
    chat.lastActivity = new Date();
    await chat.save();

    // Emit real-time message via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.to(`chat_${chatId}`).emit('new_message', {
        messageId: newMessage._id,
        chatId,
        sender: newMessage.sender,
        message: newMessage.message,
        messageType: newMessage.messageType,
        createdAt: newMessage.createdAt,
        isEdited: newMessage.isEdited
      });
    }

    res.status(201).json({
      message: 'Message sent successfully',
      messageData: newMessage
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// READ - Get messages for a chat
router.get('/chat/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const skip = (page - 1) * limit;

    // Check if chat exists and user is participant
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    if (!chat.participants.includes(req.user._id)) {
      return res.status(403).json({ error: 'You are not a participant in this chat' });
    }

    const messages = await Message.find({ chat: chatId })
      .populate('sender', 'name role branch')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Message.countDocuments({ chat: chatId });

    res.json({
      messages: messages.reverse(), // Reverse to show oldest first
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get messages error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ error: 'Invalid chat ID' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// UPDATE - Edit a message
router.put('/:id', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    const messageDoc = await Message.findById(req.params.id);
    if (!messageDoc) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Check if user is the sender
    if (messageDoc.sender.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'You can only edit your own messages' });
    }

    // Update message
    messageDoc.message = message;
    messageDoc.isEdited = true;
    messageDoc.editedAt = new Date();

    await messageDoc.save();
    await messageDoc.populate('sender', 'name role branch');

    // Emit real-time message edit via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.to(`chat_${messageDoc.chat}`).emit('message_edited', {
        messageId: messageDoc._id,
        message: messageDoc.message,
        isEdited: messageDoc.isEdited,
        editedAt: messageDoc.editedAt
      });
    }

    res.json({
      message: 'Message updated successfully',
      messageData: messageDoc
    });
  } catch (error) {
    console.error('Edit message error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ error: 'Invalid message ID' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// UPDATE - Mark message as read
router.put('/:id/read', async (req, res) => {
  try {
    const messageDoc = await Message.findById(req.params.id);
    if (!messageDoc) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Check if user is participant in the chat
    const chat = await Chat.findById(messageDoc.chat);
    if (!chat.participants.includes(req.user._id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if already marked as read by this user
    const alreadyRead = messageDoc.readBy.some(r => r.user.toString() === req.user._id.toString());
    
    if (!alreadyRead) {
      messageDoc.readBy.push({
        user: req.user._id,
        readAt: new Date()
      });
      await messageDoc.save();
    }

    res.json({
      message: 'Message marked as read',
      messageData: messageDoc
    });
  } catch (error) {
    console.error('Mark message as read error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ error: 'Invalid message ID' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE - Delete a message
router.delete('/:id', async (req, res) => {
  try {
    const messageDoc = await Message.findById(req.params.id);
    if (!messageDoc) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Check if user is the sender or admin
    const isAdmin = req.user.tokenRoles && req.user.tokenRoles.includes('admin');
    const isSender = messageDoc.sender.toString() === req.user._id.toString();

    if (!isAdmin && !isSender) {
      return res.status(403).json({ error: 'You can only delete your own messages or be an admin' });
    }

    const chatId = messageDoc.chat;
    await Message.findByIdAndDelete(req.params.id);

    // Emit real-time message deletion via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.to(`chat_${chatId}`).emit('message_deleted', {
        messageId: req.params.id,
        chatId
      });
    }

    res.json({
      message: 'Message deleted successfully',
      messageData: messageDoc
    });
  } catch (error) {
    console.error('Delete message error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ error: 'Invalid message ID' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;