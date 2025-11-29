const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const connectDB = require('./config/db');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const orderRoutes = require('./routes/orders');
const itemRoutes = require('./routes/items');
const branchRoutes = require('./routes/branches');
const roleRoutes = require('./routes/roles');
const chatRoutes = require('./routes/chats');
const messageRoutes = require('./routes/messages');
const customerRoutes = require('./routes/customers');
const invoiceRoutes = require('./routes/invoices');
const backupRoutes = require('./routes/backup');
const statisticsRoutes = require('./routes/statistics');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Connect to MongoDB
connectDB();

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Laundry Backend API is running.' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Make io available to routes
app.set('io', io);

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/statistics', statisticsRoutes);

// Socket.IO connection handling
require('./socket/socketHandler')(io);

// Start server
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Socket.IO server is ready for connections`);
});