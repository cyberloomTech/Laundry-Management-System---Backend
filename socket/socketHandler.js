const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Chat = require('../models/Chat');
const Message = require('../models/Message');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Store active users and their socket connections
const activeUsers = new Map();

module.exports = (io) => {
  // Socket authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password -__v');
      
      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }

      // Add user info to socket
      socket.userId = user._id.toString();
      socket.userInfo = {
        _id: user._id,
        name: user.name,
        role: user.role,
        branch: user.branch
      };

      next();
    } catch (err) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    console.log(`User ${socket.userInfo.name} connected with socket ID: ${socket.id}`);
    
    // Store active user
    activeUsers.set(socket.userId, {
      socketId: socket.id,
      userInfo: socket.userInfo,
      lastSeen: new Date()
    });

    // Join user to their personal room
    socket.join(`user_${socket.userId}`);

    // Join user to their branch room if they have a branch
    if (socket.userInfo.branch) {
      socket.join(`branch_${socket.userInfo.branch}`);
    }

    // Join user to admin room if they are admin
    if (socket.userInfo.role.includes('admin')) {
      socket.join('admin_room');
    }

    // Get user's chats and join those rooms
    try {
      const userChats = await Chat.find({
        participants: socket.userId,
        isActive: true
      });

      userChats.forEach(chat => {
        socket.join(`chat_${chat._id}`);
      });
    } catch (error) {
      console.error('Error joining chat rooms:', error);
    }

    // Emit online status to other users
    socket.broadcast.emit('user_online', {
      userId: socket.userId,
      userInfo: socket.userInfo
    });

    // Handle joining a specific chat room
    socket.on('join_chat', async (data) => {
      try {
        const { chatId } = data;
        
        // Verify user is participant in this chat
        const chat = await Chat.findById(chatId);
        if (chat && chat.participants.includes(socket.userId)) {
          socket.join(`chat_${chatId}`);
          socket.emit('joined_chat', { chatId, success: true });
        } else {
          socket.emit('joined_chat', { chatId, success: false, error: 'Not authorized to join this chat' });
        }
      } catch (error) {
        socket.emit('joined_chat', { chatId: data.chatId, success: false, error: 'Error joining chat' });
      }
    });

    // Handle leaving a chat room
    socket.on('leave_chat', (data) => {
      const { chatId } = data;
      socket.leave(`chat_${chatId}`);
      socket.emit('left_chat', { chatId, success: true });
    });

    // Handle sending messages
    socket.on('send_message', async (data) => {
      try {
        const { chatId, message, messageType = 'text' } = data;

        // Verify user is participant in this chat
        const chat = await Chat.findById(chatId);
        if (!chat || !chat.participants.includes(socket.userId)) {
          socket.emit('message_error', { error: 'Not authorized to send message to this chat' });
          return;
        }

        // Create message in database
        const newMessage = new Message({
          chat: chatId,
          sender: socket.userId,
          message,
          messageType
        });

        await newMessage.save();
        await newMessage.populate('sender', 'name role branch');

        // Update chat's last message and activity
        chat.lastMessage = newMessage._id;
        chat.lastActivity = new Date();
        await chat.save();

        // Emit message to all participants in the chat
        io.to(`chat_${chatId}`).emit('new_message', {
          messageId: newMessage._id,
          chatId,
          sender: newMessage.sender,
          message: newMessage.message,
          messageType: newMessage.messageType,
          createdAt: newMessage.createdAt,
          isEdited: newMessage.isEdited
        });

        // Send confirmation to sender
        socket.emit('message_sent', {
          messageId: newMessage._id,
          success: true
        });

      } catch (error) {
        console.error('Error sending message:', error);
        socket.emit('message_error', { error: 'Failed to send message' });
      }
    });

    // Handle message editing
    socket.on('edit_message', async (data) => {
      try {
        const { messageId, newMessage } = data;

        const messageDoc = await Message.findById(messageId);
        if (!messageDoc) {
          socket.emit('edit_error', { error: 'Message not found' });
          return;
        }

        // Check if user is the sender
        if (messageDoc.sender.toString() !== socket.userId) {
          socket.emit('edit_error', { error: 'You can only edit your own messages' });
          return;
        }

        // Update message
        messageDoc.message = newMessage;
        messageDoc.isEdited = true;
        messageDoc.editedAt = new Date();
        await messageDoc.save();

        // Emit updated message to all participants
        io.to(`chat_${messageDoc.chat}`).emit('message_edited', {
          messageId,
          message: newMessage,
          isEdited: true,
          editedAt: messageDoc.editedAt
        });

      } catch (error) {
        console.error('Error editing message:', error);
        socket.emit('edit_error', { error: 'Failed to edit message' });
      }
    });

    // Handle message deletion
    socket.on('delete_message', async (data) => {
      try {
        const { messageId } = data;

        const messageDoc = await Message.findById(messageId);
        if (!messageDoc) {
          socket.emit('delete_error', { error: 'Message not found' });
          return;
        }

        // Check if user is the sender or admin
        const isAdmin = socket.userInfo.role.includes('admin');
        const isSender = messageDoc.sender.toString() === socket.userId;

        if (!isAdmin && !isSender) {
          socket.emit('delete_error', { error: 'You can only delete your own messages or be an admin' });
          return;
        }

        const chatId = messageDoc.chat;
        await Message.findByIdAndDelete(messageId);

        // Emit message deletion to all participants
        io.to(`chat_${chatId}`).emit('message_deleted', {
          messageId,
          chatId
        });

      } catch (error) {
        console.error('Error deleting message:', error);
        socket.emit('delete_error', { error: 'Failed to delete message' });
      }
    });

    // Handle typing indicators
    socket.on('typing_start', (data) => {
      const { chatId } = data;
      socket.to(`chat_${chatId}`).emit('user_typing', {
        userId: socket.userId,
        userName: socket.userInfo.name,
        chatId
      });
    });

    socket.on('typing_stop', (data) => {
      const { chatId } = data;
      socket.to(`chat_${chatId}`).emit('user_stopped_typing', {
        userId: socket.userId,
        chatId
      });
    });

    // Handle marking messages as read
    socket.on('mark_as_read', async (data) => {
      try {
        const { messageId } = data;

        const messageDoc = await Message.findById(messageId);
        if (!messageDoc) return;

        // Check if user is participant in the chat
        const chat = await Chat.findById(messageDoc.chat);
        if (!chat.participants.includes(socket.userId)) return;

        // Check if already marked as read by this user
        const alreadyRead = messageDoc.readBy.some(r => r.user.toString() === socket.userId);
        
        if (!alreadyRead) {
          messageDoc.readBy.push({
            user: socket.userId,
            readAt: new Date()
          });
          await messageDoc.save();

          // Emit read receipt to other participants
          socket.to(`chat_${messageDoc.chat}`).emit('message_read', {
            messageId,
            readBy: socket.userId,
            userName: socket.userInfo.name,
            readAt: new Date()
          });
        }

      } catch (error) {
        console.error('Error marking message as read:', error);
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log(`User ${socket.userInfo.name} disconnected`);
      
      // Remove from active users
      activeUsers.delete(socket.userId);

      // Emit offline status to other users
      socket.broadcast.emit('user_offline', {
        userId: socket.userId,
        userInfo: socket.userInfo,
        lastSeen: new Date()
      });
    });

    // Send list of online users to the connected user
    socket.emit('online_users', Array.from(activeUsers.values()));
  });

  // Function to get active users (can be used by routes)
  io.getActiveUsers = () => {
    return Array.from(activeUsers.values());
  };

  // Function to emit to specific user (can be used by routes)
  io.emitToUser = (userId, event, data) => {
    const user = activeUsers.get(userId);
    if (user) {
      io.to(`user_${userId}`).emit(event, data);
    }
  };

  // Function to emit to chat room (can be used by routes)
  io.emitToChat = (chatId, event, data) => {
    io.to(`chat_${chatId}`).emit(event, data);
  };
};