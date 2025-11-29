// Script to fix orders with null customers
// Run this with: node utils/fixNullCustomers.js

const mongoose = require('mongoose');
const Order = require('../models/Order');
const Customer = require('../models/Customer');

const DB_URI = 'mongodb://localhost:27017/laundry_db';

async function fixNullCustomers() {
  try {
    await mongoose.connect(DB_URI);
    console.log('Connected to MongoDB');

    // Find all orders with null customers
    const ordersWithNullCustomer = await Order.find({ customer: null });
    
    console.log(`Found ${ordersWithNullCustomer.length} orders with null customers`);

    if (ordersWithNullCustomer.length === 0) {
      console.log('No orders to fix!');
      await mongoose.disconnect();
      return;
    }

    // Get the first customer as a default (or create one)
    let defaultCustomer = await Customer.findOne();
    
    if (!defaultCustomer) {
      console.log('No customers found. Creating a default customer...');
      defaultCustomer = await Customer.create({
        name: 'Unknown Customer',
        phone: '000-000-0000',
        address: 'N/A'
      });
      console.log('Default customer created:', defaultCustomer._id);
    }

    // Update all orders with null customers
    const result = await Order.updateMany(
      { customer: null },
      { $set: { customer: defaultCustomer._id } }
    );

    console.log(`Updated ${result.modifiedCount} orders with default customer`);
    console.log('Fix completed!');

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Error fixing null customers:', error);
    await mongoose.disconnect();
  }
}

fixNullCustomers();
