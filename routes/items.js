const express = require('express');
const Item = require('../models/Item');
const { authenticateToken, requireRole, requirePermission } = require('../middleware/auth');

const router = express.Router();

// CREATE - Add new item
router.post('/', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { itemType, category, price } = req.body;

    // Validation
    if (!itemType || !price) {
      return res.status(400).json({ error: 'Item type and price are required' });
    }

    if (price < 0) {
      return res.status(400).json({ error: 'Price must be a positive number' });
    }

    // Create new item
    const item = new Item({
      itemType,
      category,
      price
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
    const { itemType, category, price } = req.body;

    const item = await Item.findById(req.params.id);

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Validation
    if (price !== undefined && price < 0) {
      return res.status(400).json({ error: 'Price must be a positive number' });
    }

    // Update fields
    if (itemType) item.itemType = itemType;
    if (category) item.category = category;
    if (price !== undefined) item.price = price;

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
