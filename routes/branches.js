const express = require('express');
const Branch = require('../models/Branch');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// All routes require admin authentication
router.use(authenticateToken);
router.use(requireRole('admin'));

// CREATE - Add new branch
router.post('/', async (req, res) => {
  try {
    const { branch } = req.body;

    // Validation
    if (!branch) {
      return res.status(400).json({ error: 'Branch name is required' });
    }

    // Check if branch already exists
    const existingBranch = await Branch.findOne({ branch });
    if (existingBranch) {
      return res.status(409).json({ error: 'Branch already exists' });
    }

    // Create branch
    const newBranch = new Branch({ branch });
    await newBranch.save();

    res.status(201).json({
      message: 'Branch created successfully',
      branch: newBranch
    });
  } catch (error) {
    console.error('Create branch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// READ - Get all branches
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    // Pagination
    const skip = (page - 1) * limit;

    const branches = await Branch.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Branch.countDocuments();

    res.json({
      branches,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get branches error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// READ - Get single branch by ID
router.get('/:id', async (req, res) => {
  try {
    const branch = await Branch.findById(req.params.id);

    if (!branch) {
      return res.status(404).json({ error: 'Branch not found' });
    }

    res.json({ branch });
  } catch (error) {
    console.error('Get branch error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ error: 'Invalid branch ID' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// UPDATE - Update branch
router.put('/:id', async (req, res) => {
  try {
    const { branch } = req.body;

    const existingBranch = await Branch.findById(req.params.id);

    if (!existingBranch) {
      return res.status(404).json({ error: 'Branch not found' });
    }

    // Check if new branch name already exists (if changing name)
    if (branch && branch !== existingBranch.branch) {
      const duplicateBranch = await Branch.findOne({ branch });
      if (duplicateBranch) {
        return res.status(409).json({ error: 'Branch name already exists' });
      }
      existingBranch.branch = branch;
    }

    await existingBranch.save();

    res.json({
      message: 'Branch updated successfully',
      branch: existingBranch
    });
  } catch (error) {
    console.error('Update branch error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ error: 'Invalid branch ID' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE - Delete branch
router.delete('/:id', async (req, res) => {
  try {
    const User = require('../models/User');
    
    const branch = await Branch.findById(req.params.id);

    if (!branch) {
      return res.status(404).json({ error: 'Branch not found' });
    }

    // Remove branch reference from all users who have this branch
    const updateResult = await User.updateMany(
      { branch: req.params.id },
      { $unset: { branch: '' } }
    );

    console.log(`Updated ${updateResult.modifiedCount} users by removing branch reference`);

    // Delete the branch
    await Branch.findByIdAndDelete(req.params.id);

    res.json({
      message: 'Branch deleted successfully',
      branch,
      usersUpdated: updateResult.modifiedCount
    });
  } catch (error) {
    console.error('Delete branch error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ error: 'Invalid branch ID' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;