const express = require('express');
const Customer = require('../models/Customer');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// CREATE - Add new customer
router.post('/', async (req, res) => {
  try {
    const { name, phone, phone2, address, email, rnc, note } = req.body;

    // Validation
    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and phone are required' });
    }

    // Check if customer with same phone already exists
    const existingCustomer = await Customer.findOne({ name });
    if (existingCustomer) {
      return res.status(400).json({ error: 'Customer with this name already exists' });
    }

    // Create new customer
    const customer = new Customer({
      name,
      phone,
      phone2,
      address,
      email,
      rnc,
      note
    });

    await customer.save();

    res.status(201).json({
      message: 'Customer created successfully',
      customer
    });
  } catch (error) {
    console.error('Create customer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// READ - Get all customers with filtering and pagination
router.get('/', async (req, res) => {
  try {
    const { 
      search,
      page = 1, 
      limit = 10 
    } = req.query;

    // Build filter
    const filter = {};
    
    // Search by name, phone, or customer_code
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { customer_code: isNaN(search) ? undefined : parseInt(search) }
      ].filter(f => f.customer_code !== undefined || f.name || f.phone);
    }

    // Pagination
    const skip = (page - 1) * limit;

    const customers = await Customer.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Customer.countDocuments(filter);

    res.json({
      customers,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// READ - Get single customer by ID
router.get('/:id', async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    res.json({ customer });
  } catch (error) {
    console.error('Get customer error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ error: 'Invalid customer ID' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// UPDATE - Update customer
router.put('/:id', async (req, res) => {
  try {
    const { name, phone, phone2, address, email, rnc, note } = req.body;

    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Check if phone is being changed and if it's already taken
    if (phone && phone !== customer.phone) {
      const existingCustomer = await Customer.findOne({ phone });
      if (existingCustomer) {
        return res.status(400).json({ error: 'Customer with this phone number already exists' });
      }
    }

    // Update fields
    if (name) customer.name = name;
    if (phone) customer.phone = phone;
    if (phone2 !== undefined) customer.phone2 = phone2;
    if (address !== undefined) customer.address = address;
    if (email !== undefined) customer.email = email;
    if (rnc !== undefined) customer.rnc = rnc;
    if (note !== undefined) customer.note = note;

    await customer.save();

    res.json({
      message: 'Customer updated successfully',
      customer
    });
  } catch (error) {
    console.error('Update customer error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ error: 'Invalid customer ID' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE - Delete customer
router.delete('/:id', async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    await Customer.findByIdAndDelete(req.params.id);

    res.json({
      message: 'Customer deleted successfully',
      customer
    });
  } catch (error) {
    console.error('Delete customer error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ error: 'Invalid customer ID' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
