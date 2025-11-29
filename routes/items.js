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

// BULK UPDATE - Update multiple items at once
router.put('/', authenticateToken, requirePermission('price'), async (req, res) => {
  try {
    const { updates } = req.body;

    // Validation
    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: 'Updates array is required and must not be empty' });
    }

    // Validate each update
    for (const update of updates) {
      if (!update._id && !update.itemName) {
        return res.status(400).json({ error: 'Each update must have an _id or itemName' });
      }

      // Validate prices are positive
      if ((update.wash !== undefined && update.wash < 0) ||
          (update.iron !== undefined && update.iron < 0) ||
          (update.repair !== undefined && update.repair < 0)) {
        return res.status(400).json({ error: `Prices for ${update.itemName} must be positive numbers` });
      }
    }

    // Build bulk operations
    const operations = updates.map(item => {
      const updateFields = {};
      if (item.itemName !== undefined) updateFields.itemName = item.itemName;
      if (item.category !== undefined) updateFields.category = item.category;
      if (item.wash !== undefined) updateFields.wash = item.wash;
      if (item.iron !== undefined) updateFields.iron = item.iron;
      if (item.repair !== undefined) updateFields.repair = item.repair;

      // Use _id if available, otherwise use itemName
      const filter = item._id ? { _id: item._id } : { itemName: item.itemName };

      return {
        updateOne: {
          filter,
          update: { $set: updateFields }
        }
      };
    });

    // Execute bulk write
    const result = await Item.bulkWrite(operations);

    res.json({
      message: 'Items updated successfully',
      result: {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        upsertedCount: result.upsertedCount
      }
    });
  } catch (error) {
    console.error('Bulk update items error:', error);
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
