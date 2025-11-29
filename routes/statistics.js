const express = require('express');
const Order = require('../models/Order');
const Invoice = require('../models/Invoice');
const Customer = require('../models/Customer');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET - Dashboard statistics
router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    const now = new Date();
    const startOfToday = new Date(now.setHours(0, 0, 0, 0));
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    // Total counts
    const totalOrders = await Order.countDocuments();
    const totalInvoices = await Invoice.countDocuments();
    const totalCustomers = await Customer.countDocuments();

    // Today's stats
    const todayOrders = await Order.countDocuments({ createdAt: { $gte: startOfToday } });
    const todayInvoices = await Invoice.countDocuments({ createdAt: { $gte: startOfToday } });
    const todayRevenue = await Invoice.aggregate([
      { $match: { createdAt: { $gte: startOfToday } } },
      { $group: { _id: null, total: { $sum: '$paid' } } }
    ]);

    // This week's stats
    const weekOrders = await Order.countDocuments({ createdAt: { $gte: startOfWeek } });
    const weekRevenue = await Invoice.aggregate([
      { $match: { createdAt: { $gte: startOfWeek } } },
      { $group: { _id: null, total: { $sum: '$paid' } } }
    ]);

    // This month's stats
    const monthOrders = await Order.countDocuments({ createdAt: { $gte: startOfMonth } });
    const monthRevenue = await Invoice.aggregate([
      { $match: { createdAt: { $gte: startOfMonth } } },
      { $group: { _id: null, total: { $sum: '$paid' } } }
    ]);

    // Order status breakdown
    const ordersByStatus = await Order.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    // Revenue by payment method
    const revenueByPaymentMethod = await Invoice.aggregate([
      {
        $project: {
          cash: '$cash_amount',
          card: '$card_amount',
          transfer: '$bank_tranfer_amount'
        }
      },
      {
        $group: {
          _id: null,
          cash: { $sum: '$cash' },
          card: { $sum: '$card' },
          transfer: { $sum: '$transfer' }
        }
      }
    ]);

    // Last 7 days revenue trend
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const dayRevenue = await Invoice.aggregate([
        { $match: { createdAt: { $gte: date, $lt: nextDate } } },
        { $group: { _id: null, total: { $sum: '$paid' } } }
      ]);

      const dayOrders = await Order.countDocuments({ createdAt: { $gte: date, $lt: nextDate } });

      last7Days.push({
        date: date.toISOString().split('T')[0],
        revenue: dayRevenue[0]?.total || 0,
        orders: dayOrders
      });
    }

    // Last 12 months revenue trend
    const last12Months = [];
    for (let i = 11; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const startOfMonthDate = new Date(date.getFullYear(), date.getMonth(), 1);
      const endOfMonthDate = new Date(date.getFullYear(), date.getMonth() + 1, 0);

      const monthRevenue = await Invoice.aggregate([
        { $match: { createdAt: { $gte: startOfMonthDate, $lte: endOfMonthDate } } },
        { $group: { _id: null, total: { $sum: '$paid' } } }
      ]);

      const monthOrders = await Order.countDocuments({ 
        createdAt: { $gte: startOfMonthDate, $lte: endOfMonthDate } 
      });

      last12Months.push({
        month: startOfMonthDate.toLocaleString('default', { month: 'short', year: 'numeric' }),
        revenue: monthRevenue[0]?.total || 0,
        orders: monthOrders
      });
    }

    // Top customers by revenue
    const topCustomers = await Invoice.aggregate([
      {
        $lookup: {
          from: 'orders',
          localField: 'order',
          foreignField: '_id',
          as: 'orderData'
        }
      },
      { $unwind: '$orderData' },
      {
        $lookup: {
          from: 'customers',
          localField: 'orderData.customer',
          foreignField: '_id',
          as: 'customerData'
        }
      },
      { $unwind: '$customerData' },
      {
        $group: {
          _id: '$customerData._id',
          name: { $first: '$customerData.name' },
          phone: { $first: '$customerData.phone' },
          totalRevenue: { $sum: '$paid' },
          orderCount: { $sum: 1 }
        }
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: 5 }
    ]);

    // Pending payments
    const pendingPayments = await Invoice.aggregate([
      { $match: { remain: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: '$remain' } } }
    ]);

    res.json({
      summary: {
        totalOrders,
        totalInvoices,
        totalCustomers,
        todayOrders,
        todayInvoices,
        todayRevenue: todayRevenue[0]?.total || 0,
        weekOrders,
        weekRevenue: weekRevenue[0]?.total || 0,
        monthOrders,
        monthRevenue: monthRevenue[0]?.total || 0,
        pendingPayments: pendingPayments[0]?.total || 0
      },
      ordersByStatus,
      revenueByPaymentMethod: revenueByPaymentMethod[0] || { cash: 0, card: 0, transfer: 0 },
      last7Days,
      last12Months,
      topCustomers
    });
  } catch (error) {
    console.error('Get statistics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
