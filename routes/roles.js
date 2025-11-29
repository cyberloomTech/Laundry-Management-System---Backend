const express = require('express');
const Role = require('../models/Role');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// All routes require admin authentication
router.use(authenticateToken);
router.use(requireRole('admin'));

// CREATE - Add new role
router.post('/', async (req, res) => {
  try {
    const { roleName, permission } = req.body;

    // Validation
    if (!roleName) {
      return res.status(400).json({ error: 'Role name is required' });
    }

    // Check if role already exists
    const existingRole = await Role.findOne({ roleName });
    if (existingRole) {
      return res.status(409).json({ error: 'Role already exists' });
    }

    // Create role
    const newRole = new Role({ 
      roleName, 
      permission: permission || [] 
    });
    await newRole.save();

    res.status(201).json({
      message: 'Role created successfully',
      role: newRole
    });
  } catch (error) {
    console.error('Create role error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// READ - Get all roles
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    // Pagination
    const skip = (page - 1) * limit;

    const roles = await Role.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Role.countDocuments();

    res.json({
      roles,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get roles error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// READ - Get single role by ID
router.get('/:id', async (req, res) => {
  try {
    const role = await Role.findById(req.params.id);

    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }

    res.json({ role });
  } catch (error) {
    console.error('Get role error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ error: 'Invalid role ID' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// BULK UPDATE - Update multiple roles at once
router.put('/', async (req, res) => {
  try {
    const { updates } = req.body;

    // Validation
    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: 'Updates array is required and must not be empty' });
    }

    // Validate each update
    for (const update of updates) {
      if (!update._id) {
        return res.status(400).json({ error: 'Each update must have an _id' });
      }

      // Check if at least roleName or permission is provided
      if (!update.roleName && !update.permission) {
        return res.status(400).json({ error: `Update for role ${update._id} must include roleName or permission` });
      }

      // Validate permission is an array if provided
      if (update.permission !== undefined && !Array.isArray(update.permission)) {
        return res.status(400).json({ error: `Permission for role ${update._id} must be an array` });
      }
    }

    // Build bulk operations
    const operations = updates.map(item => {
      const updateFields = {};
      if (item.roleName !== undefined) updateFields.roleName = item.roleName;
      if (item.permission !== undefined) updateFields.permission = item.permission;

      return {
        updateOne: {
          filter: { _id: item._id },
          update: { $set: updateFields }
        }
      };
    });

    // Execute bulk write
    const result = await Role.bulkWrite(operations);

    res.json({
      message: 'Roles updated successfully',
      result: {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        upsertedCount: result.upsertedCount
      }
    });
  } catch (error) {
    console.error('Bulk update roles error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// UPDATE - Update role permissions
router.put('/:id', async (req, res) => {
  try {
    const { roleName, permission } = req.body;

    const existingRole = await Role.findById(req.params.id);

    if (!existingRole) {
      return res.status(404).json({ error: 'Role not found' });
    }

    // Update role name if provided
    if (roleName && roleName !== existingRole.roleName) {
      const duplicateRole = await Role.findOne({ roleName });
      if (duplicateRole) {
        return res.status(409).json({ error: 'Role name already exists' });
      }
      existingRole.roleName = roleName;
    }

    // Update permissions if provided
    if (permission !== undefined) {
      existingRole.permission = permission;
    }

    await existingRole.save();

    res.json({
      message: 'Role updated successfully',
      role: existingRole
    });
  } catch (error) {
    console.error('Update role error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ error: 'Invalid role ID' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE - Delete role
router.delete('/:id', async (req, res) => {
  try {
    const User = require('../models/User');
    
    const role = await Role.findById(req.params.id);

    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }

    // Remove role from all users who have this role
    // Since role is stored as an array of strings (roleName), we use $pull
    const updateResult = await User.updateMany(
      { role: role.roleName },
      { $pull: { role: role.roleName } }
    );

    console.log(`Updated ${updateResult.modifiedCount} users by removing role: ${role.roleName}`);

    // Delete the role
    await Role.findByIdAndDelete(req.params.id);

    res.json({
      message: 'Role deleted successfully',
      role,
      usersUpdated: updateResult.modifiedCount
    });
  } catch (error) {
    console.error('Delete role error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ error: 'Invalid role ID' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;