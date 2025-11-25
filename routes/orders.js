const express = require('express');
const Order = require('../models/Order');
const { authenticateToken, requirePermission, requireRole } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// CREATE - Add new laundry order
router.post('/', requirePermission('order'), async (req, res) => {
  try {
    const { customerName, customerPhone, items, totalAmount, status, paymentStatus, notes } = req.body;

    // Validation
    if (!customerName || !customerPhone || !items || !totalAmount) {
      return res.status(400).json({ error: 'Customer name, phone, items, and total amount are required' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items must be a non-empty array' });
    }

    // Create new laundry order
    const order = new Order({
      customerName,
      customerPhone,
      items,
      totalAmount,
      status: status,
      paymentStatus: paymentStatus,
      notes,
      createdBy: req.user._id
    });

    await order.save();

    res.status(201).json({
      message: 'Laundry order created successfully',
      order
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// READ - Get all laundry orders with advanced filtering
router.get('/', async (req, res) => {
  try {
    const { 
      status, 
      paymentStatus, 
      fromDate, 
      toDate, 
      today,
      page = 1, 
      limit = 10 
    } = req.query;

    // Build filter
    const filter = {};
    
    // Filter by status (received, completed, delivered)
    if (status) {
      if (!['received', 'completed', 'delivered'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status. Must be: received, completed, or delivered' });
      }
      filter.status = status;
    }
    
    // Filter by payment status
    if (paymentStatus) {
      if (!['unpaid', 'partial', 'paid'].includes(paymentStatus)) {
        return res.status(400).json({ error: 'Invalid payment status. Must be: unpaid, partial, or paid' });
      }
      filter.paymentStatus = paymentStatus;
    }

    // Filter by today's orders
    if (today === 'true') {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);
      
      filter.createdAt = {
        $gte: startOfDay,
        $lte: endOfDay
      };
    }
    // Filter by date range (fromDate to toDate)
    else if (fromDate || toDate) {
      filter.createdAt = {};
      
      if (fromDate) {
        const from = new Date(fromDate);
        if (isNaN(from.getTime())) {
          return res.status(400).json({ error: 'Invalid fromDate format. Use YYYY-MM-DD' });
        }
        from.setHours(0, 0, 0, 0);
        filter.createdAt.$gte = from;
      }
      
      if (toDate) {
        const to = new Date(toDate);
        if (isNaN(to.getTime())) {
          return res.status(400).json({ error: 'Invalid toDate format. Use YYYY-MM-DD' });
        }
        to.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = to;
      }
    }

    // Pagination
    const skip = (page - 1) * limit;

    const orders = await Order.find(filter)
      .populate('createdBy', 'name role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Order.countDocuments(filter);

    res.json({
      orders,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      },
      filters: {
        status: status || 'all',
        paymentStatus: paymentStatus || 'all',
        dateRange: today === 'true' ? 'today' : (fromDate || toDate) ? `${fromDate || 'start'} to ${toDate || 'now'}` : 'all'
      }
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// READ - Get single laundry order by ID
router.get('/:id', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('createdBy', 'name role');

    if (!order) {
      return res.status(404).json({ error: 'Laundry order not found' });
    }

    res.json({ order });
  } catch (error) {
    console.error('Get order error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ error: 'Invalid laundry ID' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// UPDATE - Update laundry order
router.put('/:id', requirePermission('status'), async (req, res) => {
  try {
    const { customerName, customerPhone, customerEmail, items, totalAmount, status, paymentStatus, notes } = req.body;

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ error: 'Laundry order not found' });
    }

    // Update fields
    if (customerName) order.customerName = customerName;
    if (customerPhone) order.customerPhone = customerPhone;
    if (customerEmail) order.customerEmail = customerEmail;
    if (items) order.items = items;
    if (totalAmount) order.totalAmount = totalAmount;
    if (status) order.status = status;
    if (paymentStatus) order.paymentStatus = paymentStatus;
    if (notes !== undefined) order.notes = notes;

    await order.save();

    res.json({
      message: 'Laundry order updated successfully',
      order
    });
  } catch (error) {
    console.error('Update laundry error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ error: 'Invalid laundry ID' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE - Delete laundry order
router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ error: 'Laundry order not found' });
    }

    await Order.findByIdAndDelete(req.params.id);

    res.json({
      message: 'Laundry order deleted successfully',
      order
    });
  } catch (error) {
    console.error('Delete order error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ error: 'Invalid order ID' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
