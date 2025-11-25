const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { JWT_SECRET } = require('../middleware/auth');
const { getUserPermissions } = require('../utils/roleUtils');

const router = express.Router();

// Register endpoint
router.post('/register', async (req, res) => {
  try {
    const { name, password, password2, role, branch } = req.body;

    // Validation
    if (!name || !password || !password2) {
      return res.status(400).json({ error: 'Name, password, and password confirmation are required' });
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

    // Create user
    const user = new User({
      name,
      password,
      role,
      branch
    });

    await user.save();

    // Generate JWT token with roles and permissions
    const token = jwt.sign(
      { 
        id: user._id, 
        name: user.name, 
        roles: user.role,
        branch: user.branch 
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      user: user.toJSON(),
      token
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login endpoint
router.post('/login', async (req, res) => {
  try {
    const { name, password } = req.body;

    // Validation
    if (!name || !password) {
      return res.status(400).json({ error: 'Name and password are required' });
    }

    // Find user
    const user = await User.findOne({ name });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Validate password
    const isValidPassword = await user.validatePassword(password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Get unique permissions for user's roles
    const uniquePermissions = await getUserPermissions(user.role);

    // Generate JWT token with roles and permissions
    const token = jwt.sign(
      { 
        id: user._id, 
        name: user.name, 
        roles: user.role,
        permissions: uniquePermissions,
        branch: user.branch 
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      user: user.toJSON(),
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;