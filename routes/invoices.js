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
      customer_code,
      customerName,
      customerPhone,
      delivery_from,
      delivery_to,
      status,
      fromDate, 
      toDate, 
      today,
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

    // Filter by customer_code, customerName, or customerPhone
    if (customer_code || customerName || customerPhone) {
      const Customer = require('../models/Customer');
      
      const customerFilter = {};
      if (customer_code) {
        customerFilter.customer_code = parseInt(customer_code);
      }
      if (customerName) {
        customerFilter.name = { $regex: customerName, $options: 'i' };
      }
      if (customerPhone) {
        customerFilter.phone = { $regex: customerPhone, $options: 'i' };
      }
      
      // Find matching customers
      const customers = await Customer.find(customerFilter).select('_id');
      const customerIds = customers.map(c => c._id);
      
      if (customerIds.length > 0) {
        // Find orders with these customers
        const orders = await Order.find({ customer: { $in: customerIds } }).select('_id');
        const orderIds = orders.map(o => o._id);
        
        if (orderIds.length > 0) {
          filter.order = { $in: orderIds };
        } else {
          // No orders found for these customers
          return res.json({
            message: 'No orders found for these customers',
            invoices: [],
            pagination: {
              total: 0,
              page: parseInt(page),
              limit: parseInt(limit),
              pages: 0
            }
          });
        }
      } else {
        // No customers found
        return res.json({
          message: 'No customers found',
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
        const from = new Date(delivery_from + 'T00:00:00.000Z');
        if (!isNaN(from.getTime())) {
          filter.delivery_date.$gte = from;
        }
      }
      
      if (delivery_to) {
        const to = new Date(delivery_to + 'T23:59:59.999Z');
        if (!isNaN(to.getTime())) {
          filter.delivery_date.$lte = to;
        }
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

    // Filter by today's invoices
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
        const from = new Date(fromDate + 'T00:00:00.000Z');
        if (isNaN(from.getTime())) {
          return res.status(400).json({ error: 'Invalid fromDate format. Use YYYY-MM-DD' });
        }
        filter.createdAt.$gte = from;
      }
      
      if (toDate) {
        const to = new Date(toDate + 'T23:59:59.999Z');
        if (isNaN(to.getTime())) {
          return res.status(400).json({ error: 'Invalid toDate format. Use YYYY-MM-DD' });
        }
        filter.createdAt.$lte = to;
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
