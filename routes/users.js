const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const User = require('../models/User');
const Role = require('../models/Role');
const Branch = require('../models/Branch');
const { authenticateToken, requireRole, requirePermission } = require('../middleware/auth');

const router = express.Router();

// Configure multer for avatar uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/avatars';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'avatar-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'));
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: fileFilter
});

// Get current user profile (any authenticated user)
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    // Fetch user with populated branch
    const user = await User.findById(req.user._id)
      .populate('branch');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// CREATE - Add new user (admin only)
router.post('/', authenticateToken, requirePermission('user'), upload.single('avatar'), async (req, res) => {
  try {
    const { name, password, password2, role, branch } = req.body;

    // Validation
    if (!name || !password || !password2) {
      // Clean up uploaded file if validation fails
      if (req.file) {
        fs.unlink(req.file.path, (err) => {
          if (err) console.error('Error deleting file:', err);
        });
      }
      return res.status(400).json({ error: 'Name, password, and password2 are required' });
    }

    if (password !== password2) {
      // Clean up uploaded file if validation fails
      if (req.file) {
        fs.unlink(req.file.path, (err) => {
          if (err) console.error('Error deleting file:', err);
        });
      }
      return res.status(400).json({ error: 'Passwords do not match' });
    }

    if (password.length < 6) {
      // Clean up uploaded file if validation fails
      if (req.file) {
        fs.unlink(req.file.path, (err) => {
          if (err) console.error('Error deleting file:', err);
        });
      }
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ name });
    if (existingUser) {
      // Clean up uploaded file if validation fails
      if (req.file) {
        fs.unlink(req.file.path, (err) => {
          if (err) console.error('Error deleting file:', err);
        });
      }
      return res.status(409).json({ error: 'User already exists' });
    }

    // Validate roles (if provided)
    if (role && Array.isArray(role)) {
      for (let oneRole of role) {
        const validRole = await Role.findOne({ roleName: oneRole });
        if (!validRole) {
          // Clean up uploaded file if validation fails
          if (req.file) {
            fs.unlink(req.file.path, (err) => {
              if (err) console.error('Error deleting file:', err);
            });
          }
          return res.status(400).json({ error: `${oneRole} role does not exist` });
        }
      }
    }

    // Validate branch (if provided)
    if (branch) {
      const validBranch = await Branch.findById(branch);
      if (!validBranch) {
        // Clean up uploaded file if validation fails
        if (req.file) {
          fs.unlink(req.file.path, (err) => {
            if (err) console.error('Error deleting file:', err);
          });
        }
        return res.status(400).json({ error: 'This branch does not exist' });
      }
    }

    // Create user
    const user = new User({
      name,
      password,
      role: role || [],
      branch,
      avatar: req.file ? `/uploads/avatars/${req.file.filename}` : null
    });

    await user.save();

    // Populate branch before sending response
    await user.populate('branch');

    res.status(201).json({
      message: 'User created successfully',
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Create user error:', error);
    // Clean up uploaded file if user creation fails
    if (req.file) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Error deleting file:', err);
      });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// READ - Get all users with search
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { name, role, branch, page = 1, limit = 10 } = req.query;

    // Build filter
    const filter = {};
    
    // Search by name (case-insensitive partial match)
    if (name) {
      filter.name = { $regex: name, $options: 'i' };
    }
    
    // Filter by role (exact match or array contains)
    if (role) {
      filter.role = role;
    }
    
    // Filter by branch (exact match)
    if (branch) {
      filter.branch = branch;
    }

    // Pagination
    const skip = (page - 1) * limit;

    const users = await User.find(filter)
      .populate('branch')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments(filter);

    res.json({
      users,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// READ - Get single user by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .populate('branch');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// UPDATE - Update user
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { name, current_password, password, password2, branch, role } = req.body;

    const user = await User.findById(req.params.id);

    // Check if new name already exists (if changing name)
    if (name && name !== user.name) {
      const existingUser = await User.findOne({ name });
      if (existingUser) {
        return res.status(409).json({ error: 'Username already taken' });
      }
      user.name = name;
    }

    // Update password if provided
    if (password || password2) {
      // Check if current password is provided
      if (!current_password) {
        return res.status(400).json({ error: 'Current password is required to change password' });
      }

      // Verify current password
      const isMatch = await user.validatePassword(current_password);
      if (!isMatch) {
        return res.status(400).json({ error: 'Current password is incorrect' });
      }

      // Check if new passwords match
      if (password !== password2) {
        return res.status(400).json({ error: 'New passwords do not match' });
      }

      // Validate new password length
      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters long' });
      }

      user.password = password;
    }

    // Update branch if provided
      if (branch) {
        const validBranch = await Branch.findById(branch);
        if (!validBranch) {
          return res.status(400).json({ error: 'This branch does not exist' });
        }
      user.branch = branch;
    }

    // Update roles if provided
    if (role && Array.isArray(role)) {
      for (let oneRole of role) {
        const validRole = await Role.findOne({ roleName: oneRole });
        if (!validRole) {
          return res.status(400).json({ error: `${oneRole} role does not exist` });
        }
      }
      user.role = role;
    }

    await user.save();

    // Populate branch before sending response
    await user.populate('branch');

    res.json({
      message: 'User updated successfully',
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Update user error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// UPDATE - Upload/Update user avatar
router.put('/:id/avatar', authenticateToken, upload.single('avatar'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      // Clean up uploaded file
      if (req.file) {
        fs.unlink(req.file.path, (err) => {
          if (err) console.error('Error deleting file:', err);
        });
      }
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user is updating their own avatar or has permission
    if (user._id.toString() !== req.user._id.toString() && !req.user.permissions?.includes('user')) {
      // Clean up uploaded file
      if (req.file) {
        fs.unlink(req.file.path, (err) => {
          if (err) console.error('Error deleting file:', err);
        });
      }
      return res.status(403).json({ error: 'Not authorized to update this avatar' });
    }

    // Delete old avatar if exists
    if (user.avatar) {
      const oldAvatarPath = path.join(__dirname, '..', user.avatar);
      if (fs.existsSync(oldAvatarPath)) {
        fs.unlink(oldAvatarPath, (err) => {
          if (err) console.error('Error deleting old avatar:', err);
        });
      }
    }

    // Update avatar path
    user.avatar = req.file ? `/uploads/avatars/${req.file.filename}` : null;
    await user.save();

    // Populate branch before sending response
    await user.populate('branch');

    res.json({
      message: 'Avatar updated successfully',
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Update avatar error:', error);
    // Clean up uploaded file if update fails
    if (req.file) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Error deleting file:', err);
      });
    }
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE - Delete user avatar
router.delete('/:id/avatar', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user is deleting their own avatar or has permission
    if (user._id.toString() !== req.user._id.toString() && !req.user.permissions?.includes('user')) {
      return res.status(403).json({ error: 'Not authorized to delete this avatar' });
    }

    // Delete avatar file if exists
    if (user.avatar) {
      const avatarPath = path.join(__dirname, '..', user.avatar);
      if (fs.existsSync(avatarPath)) {
        fs.unlink(avatarPath, (err) => {
          if (err) console.error('Error deleting avatar:', err);
        });
      }
    }

    user.avatar = null;
    await user.save();

    // Populate branch before sending response
    await user.populate('branch');

    res.json({
      message: 'Avatar deleted successfully',
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Delete avatar error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE - Delete user (admin only)
router.delete('/:id', authenticateToken, requirePermission('user'), async (req, res) => {
  try {
    const Chat = require('../models/Chat');
    const Message = require('../models/Message');
    
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent admin from deleting themselves
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Delete avatar file if exists
    if (user.avatar) {
      const avatarPath = path.join(__dirname, '..', user.avatar);
      if (fs.existsSync(avatarPath)) {
        fs.unlink(avatarPath, (err) => {
          if (err) console.error('Error deleting avatar:', err);
        });
      }
    }

    // Find all chats where user is a participant
    const userChats = await Chat.find({ participants: req.params.id });

    // Delete all messages in those chats and the chats themselves
    for (const chat of userChats) {
      // Delete all messages in the chat
      await Message.deleteMany({ chat: chat._id });
      
      // Delete the chat
      await Chat.findByIdAndDelete(chat._id);
    }

    // Delete the user
    await User.findByIdAndDelete(req.params.id);

    res.json({
      message: 'User deleted successfully',
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Delete user error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;