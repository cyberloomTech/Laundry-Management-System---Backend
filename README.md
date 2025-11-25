# Laundry Backend API

Express.js REST API with JWT authentication and MongoDB for laundry management system.

## Functionalities

- **Authentication**: JWT-based login/register with role-based access (user/admin)
- **User Management**: Admin can perform full CRUD operations on users
- **Item Management**: Manage laundry item types with pricing and categories
- **Order Management**: Create and track orders with advanced filtering (status, date range, payment status)

## Prerequisites

- Node.js (v14 or higher)
- MongoDB (running locally or remote connection)

## Installation & Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file in root directory:
```
JWT_SECRET=your-secret-key-here
PORT=3000
MONGO_URI=mongodb://localhost:27017/laundry_db
```

3. Start MongoDB service

4. Run the application:
```bash
npm run dev    # Development with auto-reload
npm start      # Production
```

Server runs at: http://localhost:3000

## API Documentation

See `guide.txt` for complete API documentation.
