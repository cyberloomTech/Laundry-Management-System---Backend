const express = require('express');
const User = require('../models/User');
const Role = require('../models/Role');
const { authenticateToken, requireRole, requirePermission } = require('../middleware/auth');

const router = express.Router();

// Get current user profile (any authenticated user)
router.get('/profile', authenticateToken, (req, res) => {
  res.json({
    user: req.user.toJSON()
  });
});

// CREATE - Add new user (admin only)
router.post('/', authenticateToken, requirePermission('user'), async (req, res) => {
  try {
    const { name, password, password2, role, branch } = req.body;

    // Validation
    if (!name || !password || !password2) {
      return res.status(400).json({ error: 'Name, password, and password2 are required' });
    }

    if (password !== password2) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ name });
    if (existingUser) {
      return res.status(409).json({ error: 'User already exists' });
    }

    // Validate roles (if provided)
    for (let oneRole of role) {
      const validRole = await Role.findOne({ roleName: oneRole });
      if (!validRole) {
        return res.status(400).json({ error: `${oneRole} role does not exist` });
      }
    }

    // Create user
    const user = new User({
      name,
      password,
      role,
      branch
    });

    await user.save();

    // No need to populate since roles are now strings

    res.status(201).json({
      message: 'User created successfully',
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// READ - Get all users
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { role, branch, page = 1, limit = 10 } = req.query;

    // Build filter
    const filter = {};
    if (role) filter.role = role;
    if (branch) filter.branch = branch;

    // Pagination
    const skip = (page - 1) * limit;

    const users = await User.find(filter)
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
    const user = await User.findById(req.params.id);

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

// UPDATE - Update my profile
router.put('/', authenticateToken, async (req, res) => {
  try {
    const { name, password, branch } = req.body;

    const user = await User.findById(req.user._id);

    // Check if new name already exists (if changing name)
    if (name && name !== user.name) {
      const existingUser = await User.findOne({ name });
      if (existingUser) {
        return res.status(409).json({ error: 'Username already taken' });
      }
      user.name = name;
    }

    // Update password if provided
    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters long' });
      }
      user.password = password;
    }

    // Update branch if provided
    if (branch !== undefined) {
      user.branch = branch;
    }

    await user.save();

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

// UPDATE - Update user (admin only)
router.put('/:id', authenticateToken, requirePermission('user'), async (req, res) => {
  try {
    const { name, password, role, branch } = req.body;

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if new name already exists (if changing name)
    if (name && name !== user.name) {
      const existingUser = await User.findOne({ name });
      if (existingUser) {
        return res.status(409).json({ error: 'Username already taken' });
      }
      user.name = name;
    }

    // Update password if provided
    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters long' });
      }
      user.password = password;
    }

    // Update roles if exist
    for (let oneRole of role) {
      const validRole = await Role.findOne({ roleName: oneRole });
      if (!validRole) {
        return res.status(400).json({ error: `${oneRole} role does not exist` });
      }
    }
    user.role = role;

    // Update branch if provided
    if (branch !== undefined) {
      user.branch = branch;
    }

    await user.save();

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

// DELETE - Delete user (admin only)
router.delete('/:id', authenticateToken, requirePermission('user'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent admin from deleting themselves
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

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