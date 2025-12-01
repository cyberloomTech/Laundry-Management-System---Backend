const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { JWT_SECRET } = require('../middleware/auth');
const { getUserPermissions } = require('../utils/roleUtils');

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

// Register endpoint
router.post('/register', upload.single('avatar'), async (req, res) => {
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
      return res.status(400).json({ error: 'Name, password, and password confirmation are required' });
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

    // Create user
    const user = new User({
      name,
      password,
      role,
      branch,
      avatar: req.file ? `/uploads/avatars/${req.file.filename}` : null
    });

    await user.save();

    // Generate JWT token with roles and permissions
    const token = jwt.sign(
      { 
        id: user._id, 
        name: user.name, 
        roles: user.role,
        avatar: user.avatar,
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
    // Clean up uploaded file if registration fails
    if (req.file) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Error deleting file:', err);
      });
    }
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
        avatar: user.avatar,
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