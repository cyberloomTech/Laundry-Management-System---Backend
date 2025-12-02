const express = require('express');
const Invoice = require('../models/Invoice');
const Order = require('../models/Order');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// CREATE - Add new invoice
router.post('/', async (req, res) => {
  try {
    const { 
      order, 
      ncf, 
      location, 
      itbis, 
      discount, 
      total, 
      paid, 
      cash_amount, 
      card_amount, 
      bank_tranfer_amount, 
      delivery_date 
    } = req.body;

    // Validation
    if (!order || total === undefined) {
      return res.status(400).json({ error: 'Order ID and total are required' });
    }

    // Verify order exists
    const orderExists = await Order.findById(order);
    if (!orderExists) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Update order's paid amount and status
    const orderDoc = await Order.findById(order);
    
    // Calculate total paid from all invoices for this order
    const allInvoices = await Invoice.find({ order: order });
    const totalPaid = allInvoices.reduce((sum, inv) => sum + (parseFloat(inv.paid) || 0), 0);
    
    orderDoc.paid = parseFloat(totalPaid) + parseFloat(paid);
    
    // Calculate remain (unpaid amount)
    const remain = parseFloat(total) - parseFloat(orderDoc.paid);

    // Create new invoice
    const invoice = new Invoice({
      order,
      ncf,
      location,
      itbis: itbis || 0,
      discount: discount || 0,
      total,
      paid: paid || 0,
      remain,
      cash_amount,
      card_amount,
      bank_tranfer_amount,
      delivery_date
    });

    await invoice.save();
    
    // If paid equals totalAmount, set status to 'delivered'
    if (parseFloat(orderDoc.paid) >= parseFloat(orderDoc.totalAmount)) {
      orderDoc.status = 'delivered';
    } else if (orderDoc.status === 'received') {
      // If partially paid and still in 'received' status, update to 'completed'
      orderDoc.status = 'completed';
    }
    
    await orderDoc.save();

    // Populate order data before sending response
    await invoice.populate({
      path: 'order',
      populate: [
        { path: 'customer' },
        { 
          path: 'createdBy', 
          select: 'name role branch',
          populate: { path: 'branch' }
        },
        {
          path: 'items.item',
          select: 'itemName'
        }
      ]
    });

    res.status(201).json({
      message: 'Invoice created successfully',
      invoice
    });
  } catch (error) {
    console.error('Create invoice error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// READ - Get all invoices with filtering and pagination
router.get('/', async (req, res) => {
  try {
    const { 
      order,
      searchTerm,
      delivery_from,
      delivery_to,
      status,
      page = 1, 
      limit = 10 
    } = req.query;

    // Build filter
    const filter = {};
    let orderFilter = {};
    
    // Filter by order
    if (order) {
      filter.order = order;
    }

    // Filter by searchTerm (order_code, customer_code, name, or phone)
    if (searchTerm) {
      const Customer = require('../models/Customer');
      const trimmedSearch = searchTerm.trim();
      
      // Search in multiple fields
      const customerFilter = {
        $or: [
          { customer_code: isNaN(trimmedSearch) ? -1 : parseInt(trimmedSearch) },
          { name: { $regex: trimmedSearch, $options: 'i' } },
          { phone: { $regex: trimmedSearch.replace(/[\s\-\(\)]/g, ''), $options: 'i' } }
        ]
      };
      
      // Find matching customers
      const customers = await Customer.find(customerFilter).select('_id');
      const customerIds = customers.map(c => c._id);
      
      // Also search by order_code
      const orderSearchFilter = {
        $or: [
          { order_code: isNaN(trimmedSearch) ? -1 : parseInt(trimmedSearch) }
        ]
      };
      
      if (customerIds.length > 0) {
        orderSearchFilter.$or.push({ customer: { $in: customerIds } });
      }
      
      // Find orders matching search
      const orders = await Order.find(orderSearchFilter).select('_id');
      const orderIds = orders.map(o => o._id);
      
      if (orderIds.length > 0) {
        filter.order = { $in: orderIds };
      } else {
        // No matches found
        return res.json({
          invoices: [],
          pagination: {
            total: 0,
            page: parseInt(page),
            limit: parseInt(limit),
            pages: 0
          }
        });
      }
    }

    // Filter by delivery date range
    if (delivery_from || delivery_to) {
      filter.delivery_date = {};
      
      if (delivery_from) {
        // Parse the date string and create a date at start of day in local timezone
        const [year, month, day] = delivery_from.split('-').map(Number);
        const from = new Date(year, month - 1, day, 0, 0, 0, 0);
        if (isNaN(from.getTime())) {
          return res.status(400).json({ error: 'Invalid delivery_from format. Use YYYY-MM-DD' });
        }
        filter.delivery_date.$gte = from;
      }
      
      if (delivery_to) {
        // Parse the date string and create a date at end of day in local timezone
        const [year, month, day] = delivery_to.split('-').map(Number);
        const to = new Date(year, month - 1, day, 23, 59, 59, 999);
        if (isNaN(to.getTime())) {
          return res.status(400).json({ error: 'Invalid delivery_to format. Use YYYY-MM-DD' });
        }
        filter.delivery_date.$lte = to;
      }
    }

    // Filter by order status
    if (status) {
      orderFilter.status = status;
    }

    // If we have order status filter, find matching orders first
    if (status) {
      const matchingOrders = await Order.find(orderFilter).select('_id');
      const orderIds = matchingOrders.map(o => o._id);
      
      if (orderIds.length > 0) {
        // Combine with existing order filter if any
        if (filter.order) {
          if (filter.order.$in) {
            // Intersect the two arrays
            filter.order.$in = filter.order.$in.filter(id => 
              orderIds.some(oid => oid.toString() === id.toString())
            );
          } else {
            // Check if single order ID is in the matching orders
            if (orderIds.some(oid => oid.toString() === filter.order.toString())) {
              filter.order = { $in: [filter.order] };
            } else {
              filter.order = { $in: [] }; // No match
            }
          }
        } else {
          filter.order = { $in: orderIds };
        }
      } else {
        // No orders match the status filter
        return res.json({
          invoices: [],
          pagination: {
            total: 0,
            page: parseInt(page),
            limit: parseInt(limit),
            pages: 0
          }
        });
      }
    }

    // Pagination
    const skip = (page - 1) * limit;

    let invoices = await Invoice.find(filter)
      .populate({
        path: 'order',
        populate: [
          { 
            path: 'customer',
            select: 'customer_code name phone phone2 address email rnc'
          },
          { 
            path: 'createdBy', 
            select: 'name role branch',
            populate: { path: 'branch' }
          },
          {
            path: 'items.item',
            select: 'itemName'
          }
        ]
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Invoice.countDocuments(filter);

    res.json({
      invoices,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get invoices error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// READ - Get single invoice by ID
router.get('/:id', async (req, res) => {
  try {
    let invoice = await Invoice.findById(req.params.id)
      .populate({
        path: 'order',
        populate: [
          { 
            path: 'customer',
            select: 'customer_code name phone phone2 address email rnc'
          },
          { 
            path: 'createdBy', 
            select: 'name role branch',
            populate: { path: 'branch' }
          },
          {
            path: 'items.item',
            select: 'itemName'
          }
        ]
      });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    res.json({ invoice });
  } catch (error) {
    console.error('Get invoice error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ error: 'Invalid invoice ID' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// UPDATE - Update invoice
router.put('/:id', async (req, res) => {
  try {
    const { 
      order, 
      ncf, 
      location, 
      itbis, 
      discount, 
      total, 
      paid, 
      cash_amount, 
      card_amount, 
      bank_tranfer_amount, 
      delivery_date 
    } = req.body;

    const invoice = await Invoice.findById(req.params.id);

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const orderId = invoice.order;

    // Verify order exists if being updated
    if (order && order !== invoice.order.toString()) {
      const orderExists = await Order.findById(order);
      if (!orderExists) {
        return res.status(404).json({ error: 'Order not found' });
      }
      invoice.order = order;
    }

    let difference = 0;

    // Update fields
    if (ncf !== undefined) invoice.ncf = ncf;
    if (location !== undefined) invoice.location = location;
    if (itbis !== undefined) invoice.itbis = itbis;
    if (discount !== undefined) invoice.discount = discount;
    if (total !== undefined) invoice.total = total;
    if (paid !== undefined) {
      difference = parseFloat(invoice.paid) - parseFloat(paid);
      invoice.paid = paid;
    }
    if (cash_amount !== undefined) invoice.cash_amount = cash_amount;
    if (card_amount !== undefined) invoice.card_amount = card_amount;
    if (bank_tranfer_amount !== undefined) invoice.bank_tranfer_amount = bank_tranfer_amount;
    if (delivery_date !== undefined) invoice.delivery_date = delivery_date;
    
    const orderDoc = await Order.findById(orderId);
    orderDoc.paid = invoice.total - invoice.remain - difference;
    
    // Calculate remain (unpaid amount)
    invoice.remain = invoice.total - orderDoc.paid;
    
    await invoice.save();
    
    // Update order status based on payment
    if (parseFloat(orderDoc.paid) >= parseFloat(orderDoc.totalAmount)) {
      orderDoc.status = 'delivered';
    } else if (parseFloat(orderDoc.paid) > 0) {
      orderDoc.status = 'completed';
    } else {
      orderDoc.status = 'received';
    }
    
    await orderDoc.save();

    // Populate before sending response
    await invoice.populate({
      path: 'order',
      populate: [
        { path: 'customer' },
        { 
          path: 'createdBy', 
          select: 'name role branch',
          populate: { path: 'branch' }
        },
        {
          path: 'items.item',
          select: 'itemName'
        }
      ]
    });

    res.json({
      message: 'Invoice updated successfully',
      invoice
    });
  } catch (error) {
    console.error('Update invoice error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ error: 'Invalid invoice ID' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE - Delete invoice
router.delete('/:id', async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const orderId = invoice.order;

    await Invoice.findByIdAndDelete(req.params.id);

    // Recalculate order's total paid from remaining invoices
    const remainingInvoices = await Invoice.find({ order: orderId });
    const totalPaid = remainingInvoices.reduce((sum, inv) => sum + (inv.paid || 0), 0);
    
    const orderDoc = await Order.findById(orderId);
    if (orderDoc) {
      orderDoc.paid = totalPaid;
      
      // Calculate remain (unpaid amount)
      const remain = orderDoc.totalAmount - totalPaid;
      
      // Update all remaining invoices for this order with the new remain value
      await Invoice.updateMany(
        { order: orderId },
        { $set: { remain: remain > 0 ? remain : 0 } }
      );
      
      // Update order status based on payment
      if (orderDoc.paid >= orderDoc.totalAmount) {
        orderDoc.status = 'delivered';
      } else if (orderDoc.paid > 0) {
        orderDoc.status = 'completed';
      } else {
        orderDoc.status = 'received';
      }
      
      await orderDoc.save();
    }

    res.json({
      message: 'Invoice deleted successfully',
      invoice
    });
  } catch (error) {
    console.error('Delete invoice error:', error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ error: 'Invalid invoice ID' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
