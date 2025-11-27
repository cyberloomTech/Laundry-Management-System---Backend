# Laundry Management System - Backend API

Express.js REST API with JWT authentication, MongoDB, and Socket.IO for real-time laundry management.

## Core Functionalities

### 1. Authentication & Authorization
- JWT-based authentication with token expiration
- Role-based access control (multiple roles per user)
- Permission-based authorization for specific actions
- User profile management

### 2. User Management
- CRUD operations for users with role and branch assignment
- Password hashing with bcrypt
- Branch-based user organization
- Profile updates with validation

### 3. Branch Management
- Multi-branch support for laundry locations
- Branch-specific user assignments
- Branch-based chat rooms

### 4. Customer Management
- Customer profiles with auto-generated customer codes
- Contact information and address tracking
- Customer search by name, phone, or code

### 5. Item Management
- Laundry items with service-based pricing (wash, iron, repair)
- Category classification (clothing, home, accessories, other)
- Individual pricing for each service type

### 6. Order Management
- Order creation with multiple items and services
- Auto-generated order codes
- Order status tracking (received → completed → delivered)
- Payment tracking with automatic status updates
- Advanced filtering (status, date range, customer, order code)
- Estimated delivery dates

### 7. Invoice Management
- Invoice generation linked to orders
- Multiple invoices per order support
- Automatic payment calculation across all invoices
- Automatic `remain` (unpaid amount) calculation
- Payment methods tracking (cash, card, bank transfer)
- NCF and location support
- ITBIS and discount handling
- **Payment Logic**: 
  - Total paid = sum of all invoice payments for an order
  - Remain = order total - total paid
  - Order status auto-updates based on payment completion

### 8. Real-time Chat System
- Three chat types: direct, branch, admin
- Real-time messaging with Socket.IO
- Message editing and deletion
- Read receipts tracking
- Chat participant management
- Last message and activity tracking

### 9. Role & Permission System
- Dynamic role creation with custom permissions
- Permission categories: user, customer, item, order, invoice, price, branch, role
- Role-based route protection

## Prerequisites

- Node.js (v14 or higher)
- MongoDB (v4.0 or higher)
- npm or yarn

## Installation & Setup

1. **Clone and install dependencies:**
```bash
npm install
```

2. **Create `.env` file in root directory:**
```env
JWT_SECRET=your-secret-key-change-in-production
PORT=5000
MONGO_URI=mongodb://localhost:27017/laundry_db
```

3. **Start MongoDB service:**
```bash
# Windows
net start MongoDB

# Linux/Mac
sudo systemctl start mongod
```

4. **Run the backend:**
```bash
npm run dev    # Development with nodemon
npm start      # Production
```

Server runs at: `http://localhost:5000`

See `guide.txt` for detailed API documentation with request/response examples.
