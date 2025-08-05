# JWT Authentication Middleware Documentation

This middleware provides JWT token verification for your Express routes in the CloudNest AI Backend.

## Overview

The authentication middleware consists of three main functions:

1. **`authenticateToken`** - Verifies JWT token and attaches user to request
2. **`optionalAuth`** - Optionally authenticates if token is present
3. **`requireAuth`** - Simple check to ensure user is authenticated (use after authenticateToken)

## Installation & Setup

The middleware is already set up in `src/middleware/authMiddleware.ts` and exported from `src/middleware/index.ts`.

### Environment Variables Required

```bash
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=7d  # Optional, defaults to 7d
```

## Usage Examples

### 1. Protected Route (Authentication Required)

```typescript
import { authenticateToken } from '../middleware/authMiddleware';

router.get('/protected', authenticateToken, (req, res) => {
    // req.user is now available and guaranteed to be defined
    res.json({
        message: 'Welcome!',
        user: req.user.name
    });
});
```

### 2. Optional Authentication

```typescript
import { optionalAuth } from '../middleware/authMiddleware';

router.get('/optional', optionalAuth, (req, res) => {
    if (req.user) {
        res.json({ message: `Hello, ${req.user.name}!` });
    } else {
        res.json({ message: 'Hello, guest!' });
    }
});
```

### 3. Multiple Middleware

```typescript
import { authenticateToken, requireAuth } from '../middleware/authMiddleware';

router.get('/admin', authenticateToken, requireAuth, (req, res) => {
    // Double-checked authentication
    res.json({ message: 'Admin access granted' });
});
```

## Client-Side Usage

### Sending JWT Token

Include the JWT token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

### Example with Fetch API

```javascript
const response = await fetch('/api/protected-endpoint', {
    method: 'GET',
    headers: {
        'Authorization': `Bearer ${yourJwtToken}`,
        'Content-Type': 'application/json'
    }
});
```

### Example with Thunder Client

1. Set Headers:
   - Key: `Authorization`
   - Value: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

## API Endpoints

### Authentication Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/auth/register` | Register new user | No |
| POST | `/api/auth/login` | Login and get JWT | No |
| GET | `/api/auth/profile` | Get user profile | Yes |
| POST | `/api/auth/logout` | Logout (client-side) | Yes |

### Example Endpoints (if using exampleRoutes.ts)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/example/public` | Public endpoint | No |
| GET | `/api/example/protected` | Protected endpoint | Yes |
| GET | `/api/example/optional` | Optional auth | No |
| GET | `/api/example/admin` | Admin endpoint | Yes |

## Error Responses

### 401 Unauthorized

```json
{
    "success": false,
    "message": "Access token is required"
}
```

```json
{
    "success": false,
    "message": "Invalid token"
}
```

```json
{
    "success": false,
    "message": "Token has expired"
}
```

### 403 Forbidden

```json
{
    "success": false,
    "message": "Authentication required"
}
```

## TypeScript Support

The middleware extends the Express Request interface to include the user property:

```typescript
declare global {
    namespace Express {
        interface Request {
            user?: IUser;
        }
    }
}
```

This means you get full TypeScript support for `req.user` in your route handlers.

## Security Features

1. **Token Validation**: Verifies JWT signature and expiration
2. **User Verification**: Checks if user still exists in database
3. **Error Handling**: Comprehensive error handling for different scenarios
4. **Type Safety**: Full TypeScript support with proper typing

## Testing

### 1. Register a User

```bash
POST /api/auth/register
Content-Type: application/json

{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "securePassword123"
}
```

### 2. Login to Get Token

```bash
POST /api/auth/login
Content-Type: application/json

{
    "email": "john@example.com",
    "password": "securePassword123"
}
```

Response:
```json
{
    "success": true,
    "message": "Login successful",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
        "id": "...",
        "name": "John Doe",
        "email": "john@example.com"
    }
}
```

### 3. Use Token in Protected Routes

```bash
GET /api/auth/profile
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Best Practices

1. **Store JWT Securely**: Use httpOnly cookies or secure storage on client-side
2. **Short Expiration**: Use short-lived tokens (1-7 days) for better security
3. **Refresh Tokens**: Implement refresh token mechanism for longer sessions
4. **HTTPS Only**: Always use HTTPS in production
5. **Environment Variables**: Never hardcode JWT secrets

## Troubleshooting

### Common Issues

1. **"Access token is required"**: Make sure Authorization header is included
2. **"Invalid token"**: Check if token is properly formatted and not corrupted
3. **"Token has expired"**: User needs to login again to get a new token
4. **"User not found"**: User might have been deleted from database

### Debug Mode

In development, the middleware logs errors to console. Check your server logs for detailed error information.
