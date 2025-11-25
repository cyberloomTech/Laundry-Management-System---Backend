const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Get full user data from database
    const user = await User.findById(decoded.id).select('-password -__v');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Convert Mongoose document to plain object and add token data
    const userObj = user.toObject();
    userObj.permissions = decoded.permissions || [];
    
    req.user = userObj;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

const requireRole = (roleName) => {
  return (req, res, next) => {
    // Check if user has the required role in their token
    if (!req.user.role || !req.user.role.includes(roleName)) {
      return res.status(403).json({ error: `Access denied. ${roleName} role required.` });
    }
    next();
  };
};

const requirePermission = (permission) => {
  return (req, res, next) => {
    // Check if user has the required permission in their token
    if (!req.user.permissions || !req.user.permissions.includes(permission)) {
      return res.status(403).json({ error: `Access denied. ${permission} permission required.` });
    }
    next();
  };
};

module.exports = { authenticateToken, requireRole, requirePermission, JWT_SECRET };