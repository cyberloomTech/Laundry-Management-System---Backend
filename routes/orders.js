const express = require('express');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const { authenticateToken, requirePermission, requireRole } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// CREATE - Add new laundry order
router.post('/', async (req, res) => {
  try {
    const { customer, items, totalAmount, status, paid, estimated_delivery } = req.body;

    // Validation
    if (!customer || !items || totalAmount === undefined) {
      return res.status(400).json({ error: 'Customer ID, items, and total amount are required' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items must be a non-empty array' });
    }

    // Validate each item
    for (const orderItem of items) {
      if (!orderItem.item || !orderItem.quantity || orderItem.price === undefined) {
        return res.status(400).json({ error: 'Each item must have item ID, quantity, and price' });
      }

      // Validate services if provided
      if (orderItem.service && Array.isArray(orderItem.service)) {
        const validServices = ['wash', 'iron', 'repair'];
        const invalidServices = orderItem.service.filter(s => !validServices.includes(s));
        if (invalidServices.length > 0) {
          return res.status(400).json({ error: `Invalid services: ${invalidServices.join(', ')}. Must be: wash, iron, or repair` });
        }
      }
    }

    // Verify customer exists
    const customerExists = await Customer.findById(customer);
    if (!customerExists) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Create new laundry order
    const order = new Order({
      customer,
      items,
      totalAmount,
      status: status || 'received',
      paid: paid || 0,
      estimated_delivery,
      createdBy: req.user._id
    });

    await order.save();

    // Populate customer and item data before sending response
    await order.populate('customer');
    await order.populate('items.item');
    await order.populate({
      path: 'createdBy',
      select: 'name role branch',
      populate: { path: 'branch' }
    });

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
      createdBy,
      order_code,
      customerName,
      customerPhone,
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

    // Filter by order_code
    if (order_code) {
      filter.order_code = parseInt(order_code);
    }

    // Filter by createdBy (user who created the order)
    if (createdBy) {
      filter.createdBy = createdBy;
    }

    // Filter by customer name or phone (requires lookup)
    if (customerName || customerPhone) {
      const customerFilter = {};
      if (customerName) {
        customerFilter.name = { $regex: customerName, $options: 'i' };
      }
      if (customerPhone) {
        customerFilter.phone = { $regex: customerPhone, $options: 'i' };
      }
      const customers = await Customer.find(customerFilter).select('_id');
      const customerIds = customers.map(c => c._id);
      
      if (customerIds.length > 0) {
        filter.customer = { $in: customerIds };
      } else {
        // No customers found, return empty result
        return res.json({
          orders: [],
          pagination: {
            total: 0,
            page: parseInt(page),
            limit: parseInt(limit),
            pages: 0
          }
        });
      }
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
    if (fromDate || toDate) {
      filter.createdAt = {};
      
      if (fromDate) {
        // Parse date and set to start of day in UTC
        const from = new Date(fromDate + 'T00:00:00.000Z');
        if (isNaN(from.getTime())) {
          return res.status(400).json({ error: 'Invalid fromDate format. Use YYYY-MM-DD' });
        }
        filter.createdAt.$gte = from;
      }
      
      if (toDate) {
        // Parse date and set to end of day in UTC
        const to = new Date(toDate + 'T23:59:59.999Z');
        if (isNaN(to.getTime())) {
          return res.status(400).json({ error: 'Invalid toDate format. Use YYYY-MM-DD' });
        }
        filter.createdAt.$lte = to;
      }
    }

    // Pagination
    const skip = (page - 1) * limit;

    const orders = await Order.find(filter)
      .populate('customer')
      .populate('items.item')
      .populate({
        path: 'createdBy',
        select: 'name role branch',
        populate: { path: 'branch' }
      })
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
      .populate('customer')
      .populate('items.item')
      .populate({
        path: 'createdBy',
        select: 'name role branch',
        populate: { path: 'branch' }
      });

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
router.put('/:id', async (req, res) => {
  try {
    const { customer, items, totalAmount, status, paid, estimated_delivery } = req.body;

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ error: 'Laundry order not found' });
    }

    // Verify customer exists if being updated
    if (customer && customer !== order.customer.toString()) {
      const customerExists = await Customer.findById(customer);
      if (!customerExists) {
        return res.status(404).json({ error: 'Customer not found' });
      }
      order.customer = customer;
    }

    // Validate items if provided
    if (items && Array.isArray(items)) {
      for (const orderItem of items) {
        if (!orderItem.item || !orderItem.quantity || orderItem.price === undefined) {
          return res.status(400).json({ error: 'Each item must have item ID, quantity, and price' });
        }

        // Validate services if provided
        if (orderItem.service && Array.isArray(orderItem.service)) {
          const validServices = ['wash', 'iron', 'repair'];
          const invalidServices = orderItem.service.filter(s => !validServices.includes(s));
          if (invalidServices.length > 0) {
            return res.status(400).json({ error: `Invalid services: ${invalidServices.join(', ')}. Must be: wash, iron, or repair` });
          }
        }
      }
    }

    // Update fields
    if (items) order.items = items;
    if (totalAmount !== undefined) order.totalAmount = totalAmount;
    if (status) order.status = status;
    if (paid !== undefined) order.paid = paid;
    if (estimated_delivery !== undefined) order.estimated_delivery = estimated_delivery;

    await order.save();

    // Populate before sending response
    await order.populate('customer');
    await order.populate('items.item');
    await order.populate({
      path: 'createdBy',
      select: 'name role branch',
      populate: { path: 'branch' }
    });

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
router.delete('/:id', async (req, res) => {
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
