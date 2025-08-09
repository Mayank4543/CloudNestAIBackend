# CloudNest Backend 🌩️

A robust personal cloud storage backend built with **Node.js**, **TypeScript**, **Express**, and **MongoDB**. This backend provides secure file upload, storage, management, and retrieval with user authentication and Google OAuth integration.

## 🚀 Features

### 🔐 Authentication & Security

- **JWT Authentication** with secure token-based sessions
- **Google OAuth 2.0** integration for seamless login
- **bcrypt** password hashing
- **CORS** configuration for cross-origin requests
- **File ownership validation** and access control

### 📁 File Management

- **Multi-format file upload** with Multer middleware
- **File metadata storage** in MongoDB
- **Public/Private file sharing** capabilities
- **Tag-based file organization**
- **Advanced file search** and filtering
- **File statistics** and analytics
- **Bulk operations** support

### 🗃️ Database & Storage

- **MongoDB** with Mongoose ODM
- **Optimized queries** with proper indexing
- **File system storage** with organized directory structure
- **Robust error handling** and data validation

### 🌐 API Features

- **RESTful API design**
- **Comprehensive pagination**
- **Advanced filtering** (by mimetype, tags, date)
- **File search functionality**
- **Health check endpoints**
- **Detailed logging** and debugging

## 🛠️ Tech Stack

- **Runtime**: Node.js (>=18.0.0)
- **Language**: TypeScript
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose
- **Authentication**: JWT + Google OAuth 2.0
- **File Upload**: Multer
- **Testing**: Jest + Supertest
- **Development**: ts-node-dev for hot reloading

## 📋 Prerequisites

Before running this project, make sure you have:

- **Node.js** (version 18.0.0 or higher)
- **MongoDB** (local installation or MongoDB Atlas account)
- **Google Cloud Console** project with OAuth 2.0 credentials
- **npm** or **yarn** package manager

## ⚡ Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/Mayank4543/CloudNestAIBackend.git
cd CloudNestAIBackend/cloudnestbackend
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Configuration

Create a `.env` file in the root directory:

```env
# Server Configuration
PORT=4000
NODE_ENV=development

# MongoDB Configuration
MONGODB_URI=mongodb_clusterURL

# CORS Configuration (comma-separated origins)
CORS_ORIGIN=http://localhost:3000,http://localhost:5173,http://localhost:8080

# File Upload Configuration
MAX_FILE_SIZE=10485760
UPLOAD_DIR=./src/upload

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d

# Google OAuth Configuration
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

### 4. Build the Project

```bash
npm run build
```

### 5. Start the Server

For development:

```bash
npm run dev
```

For production:

```bash
npm start
```

The server will be running at `http://localhost:4000`

## 📊 API Documentation

### Base URL

```
http://localhost:4000/api
```

### Authentication Endpoints

#### Register User

```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123",
  "name": "John Doe"
}
```

#### Login User

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

#### Google OAuth Login

```http
POST /api/auth/google
Content-Type: application/json

{
  "token": "google-oauth-token"
}
```

#### Forgot Password

```http
POST /api/auth/forgot-password
Content-Type: application/json

{
  "email": "user@example.com"
}
```

#### Reset Password

```http
POST /api/auth/reset-password
Content-Type: application/json

{
  "token": "reset-token-from-forgot-password",
  "password": "newSecurePassword123",
  "confirmPassword": "newSecurePassword123"
}
```

### File Management Endpoints

#### Upload File

```http
POST /api/files/upload
Authorization: Bearer <jwt-token>
Content-Type: multipart/form-data

{
  "file": <file-data>,
  "tags": ["tag1", "tag2"],
  "isPublic": false
}
```

#### Get All Files

```http
GET /api/files?page=1&limit=10&mimetype=image&tags=photo,document&sortBy=createdAt&sortOrder=desc
Authorization: Bearer <jwt-token>
```

#### Get File by ID

```http
GET /api/files/:fileId
Authorization: Bearer <jwt-token>
```

#### Search Files

```http
GET /api/files/search?q=searchTerm&page=1&limit=10
Authorization: Bearer <jwt-token>
```

#### Update File Tags

```http
PUT /api/files/:fileId/tags
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "tags": ["newTag1", "newTag2"]
}
```

#### Update File Public Status

```http
PUT /api/files/:fileId/public
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "isPublic": true
}
```

#### Delete File

```http
DELETE /api/files/:fileId
Authorization: Bearer <jwt-token>
```

#### Get File Statistics

```http
GET /api/files/stats
Authorization: Bearer <jwt-token>
```

#### Access File (Secure)

```http
GET /api/files/access/:filename
Authorization: Bearer <jwt-token> (required for private files)
```

### Utility Endpoints

#### Health Check

```http
GET /health
```

#### Debug Information

```http
GET /api/files/debug
```

## 📁 Project Structure

```
cloudnestbackend/
├── src/
│   ├── controller/           # Request handlers
│   │   ├── AuthController.ts
│   │   ├── FileController.ts
│   │   └── index.ts
│   ├── middleware/          # Custom middleware
│   │   ├── authMiddleware.ts
│   │   ├── fileServingMiddleware.ts
│   │   └── index.ts
│   ├── models/             # MongoDB models
│   │   ├── File.ts
│   │   ├── User.ts
│   │   └── index.ts
│   ├── routes/             # API routes
│   │   ├── authRoutes.ts
│   │   ├── fileRouter.ts
│   │   ├── fileRoutes.ts
│   │   └── index.ts
│   ├── services/           # Business logic
│   │   ├── FileService.ts
│   │   └── index.ts
│   ├── tests/              # Test files
│   │   ├── api.test.ts
│   │   ├── auth.test.ts
│   │   └── health.test.ts
│   ├── types/              # TypeScript definitions
│   │   └── express.d.ts
│   ├── utils/              # Utility functions
│   │   └── uploadPaths.ts
│   ├── upload/             # File storage directory
│   └── server.ts           # Main server file
├── dist/                   # Compiled JavaScript
├── docs/                   # Documentation
├── .env                    # Environment variables
├── .env.example           # Environment template
├── package.json           # Dependencies & scripts
├── tsconfig.json          # TypeScript configuration
└── README.md              # This file
```

## 🧪 Testing

Run the test suite:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## 🚀 Deployment

### Using Render.com (Recommended)

1. Connect your GitHub repository to Render
2. Set environment variables in Render dashboard
3. Deploy using the provided `render.yaml` configuration

### Manual Deployment

1. Build the project:

   ```bash
   npm run build
   ```

2. Set production environment variables

3. Start the server:
   ```bash
   npm start
   ```

## 📝 Environment Variables

| Variable               | Description                | Default      | Required |
| ---------------------- | -------------------------- | ------------ | -------- |
| `PORT`                 | Server port                | 3000         | No       |
| `NODE_ENV`             | Environment                | development  | No       |
| `MONGODB_URI`          | MongoDB connection string  | -            | Yes      |
| `CORS_ORIGIN`          | Allowed CORS origins       | -            | Yes      |
| `MAX_FILE_SIZE`        | Max upload size in bytes   | 10485760     | No       |
| `UPLOAD_DIR`           | File storage directory     | ./src/upload | No       |
| `JWT_SECRET`           | JWT signing secret         | -            | Yes      |
| `JWT_EXPIRES_IN`       | JWT expiration time        | 7d           | No       |
| `GOOGLE_CLIENT_ID`     | Google OAuth client ID     | -            | Yes      |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | -            | Yes      |

## 🔧 Development Scripts

```bash
# Start development server with hot reload
npm run dev

# Start development server with file watching
npm run watch

# Build TypeScript to JavaScript
npm run build

# Start production server
npm start

# Start server directly from dist
npm run start:direct

# Run tests
npm test

# Run tests with file watching
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

## 🛡️ Security Features

- **Input validation** and sanitization
- **File type restrictions** and validation
- **Rate limiting** (configurable)
- **Secure headers** with proper CORS setup
- **JWT token expiration** and refresh
- **Password hashing** with bcrypt
- **File access control** based on ownership

## 📚 Additional Documentation

- [Google OAuth Setup](./docs/GOOGLE_OAUTH.md)
- [JWT Middleware Guide](./docs/JWT_MIDDLEWARE.md)
- [File Upload System](./docs/FILE_UPLOAD_SYSTEM.md)
- [CI/CD Pipeline](./docs/CI_CD_PIPELINE.md)
- [Render Deployment Guide](./RENDER_DEPLOYMENT.md)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes and add tests
4. Commit your changes: `git commit -m 'Add feature'`
5. Push to the branch: `git push origin feature-name`
6. Submit a pull request

## 📄 License

This project is licensed under the ISC License.

## 👨‍💻 Author

**Mayank Rathore**

- GitHub: [@Mayank4543](https://github.com/Mayank4543)

## 🙏 Acknowledgments

- Express.js for the robust web framework
- MongoDB for the flexible database solution
- Google for OAuth 2.0 authentication services
- The open-source community for various packages and tools

---

**Happy Coding!** 🚀
