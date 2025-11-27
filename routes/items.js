const express = require('express');
const Item = require('../models/Item');
const { authenticateToken, requireRole, requirePermission } = require('../middleware/auth');

const router = express.Router();

// CREATE - Add new item
router.post('/', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { itemName, category, wash, iron, repair } = req.body;

    // Validation
    if (!itemName) {
      return res.status(400).json({ error: 'Item name is required' });
    }

    if (wash < 0 || iron < 0 || repair < 0) {
      return res.status(400).json({ error: 'Prices must be positive numbers' });
    }

    // Create new item
    const item = new Item({
      itemName,
      category,
      wash: wash || 0,
      iron: iron || 0,
      repair: repair || 0
    });

    await item.save();

    res.status(201).json({
      message: 'Item created successfully',
      item
    });
  } catch (error) {
    console.error('Create item error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// READ - Get all items
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { category, page = 1, limit = 10 } = req.query;

    // Build filter
    const filter = {};
    if (category) filter.category = category;

    // Pagination
    const skip = (page - 1) * limit;

    const items = await Item.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Item.countDocuments(filter);

    res.json({
      items,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get items error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// READ - Get single item by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json({ item });
  } catch (error) {
    console.error('Get item error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ error: 'Invalid item ID' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// UPDATE - Update item
router.put('/:id', authenticateToken, requirePermission('price'), async (req, res) => {
  try {
    const { itemName, category, wash, iron, repair } = req.body;

    const item = await Item.findById(req.params.id);

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Validation
    if ((wash !== undefined && wash < 0) || 
        (iron !== undefined && iron < 0) || 
        (repair !== undefined && repair < 0)) {
      return res.status(400).json({ error: 'Prices must be positive numbers' });
    }

    // Update fields
    if (itemName) item.itemName = itemName;
    if (category) item.category = category;
    if (wash !== undefined) item.wash = wash;
    if (iron !== undefined) item.iron = iron;
    if (repair !== undefined) item.repair = repair;

    await item.save();

    res.json({
      message: 'Item updated successfully',
      item
    });
  } catch (error) {
    console.error('Update item error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ error: 'Invalid item ID' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE - Delete item
router.delete('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    await Item.findByIdAndDelete(req.params.id);

    res.json({
      message: 'Item deleted successfully',
      item
    });
  } catch (error) {
    console.error('Delete item error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ error: 'Invalid item ID' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
