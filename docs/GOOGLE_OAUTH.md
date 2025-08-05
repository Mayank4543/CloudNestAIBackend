# Google OAuth Implementation

This document describes the Google OAuth integration for the CloudNest AI Backend.

## Overview

The Google OAuth implementation allows users to sign in using their Google accounts instead of creating traditional username/password accounts.

## Features

- ✅ Google ID token verification using `google-auth-library`
- ✅ User creation/retrieval based on Google email
- ✅ JWT token generation for authenticated sessions
- ✅ Profile picture support from Google accounts
- ✅ Seamless integration with existing auth middleware

## API Endpoint

### POST `/api/auth/google`

Authenticates a user using a Google ID token.

**Request Body:**

```json
{
  "token": "<Google ID Token from client-side OAuth>"
}
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Google login successful",
  "data": {
    "token": "<JWT_TOKEN>",
    "user": {
      "_id": "60d5ec49f1b2c8b1f8e4e1a1",
      "name": "John Doe",
      "email": "john.doe@gmail.com",
      "picture": "https://lh3.googleusercontent.com/a/..."
    }
  }
}
```

**Error Responses:**

- `400 Bad Request`: Missing token or invalid Google profile data
- `401 Unauthorized`: Invalid or expired Google token
- `500 Internal Server Error`: Server error during authentication

## Environment Variables

Add these variables to your `.env` file:

```bash
# Google OAuth Configuration
GOOGLE_CLIENT_ID=your-google-oauth-client-id-here

# JWT Configuration (if not already set)
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRES_IN=7d
```

## User Model Updates

The User model has been updated to support Google OAuth users:

```typescript
interface IUser {
  _id: mongoose.Types.ObjectId;
  name: string;
  email: string;
  password?: string; // Optional for Google OAuth users
  picture?: string; // Profile picture URL from Google
  createdAt: Date;
  updatedAt: Date;
}
```

## Flow Description

1. **Client-side**: User initiates Google OAuth and receives an ID token
2. **Token Verification**: Server verifies the token with Google's servers
3. **User Lookup**: Check if user exists by email in MongoDB
4. **User Creation/Update**:
   - If user exists: Update profile picture if changed
   - If new user: Create user with Google profile data
5. **JWT Generation**: Generate JWT token for the user
6. **Response**: Return JWT and user data to client

## Security Considerations

- ✅ Google tokens are verified against Google's servers
- ✅ No passwords stored for Google OAuth users
- ✅ JWT tokens have configurable expiration
- ✅ Profile pictures are optional and safe to store
- ✅ Email validation handled by Google OAuth

## Testing

To test the Google OAuth endpoint:

1. Obtain a Google ID token from the client-side OAuth flow
2. Send a POST request to `/api/auth/google` with the token
3. Verify the response contains a valid JWT and user data

## Integration Notes

- Works seamlessly with existing JWT middleware
- Compatible with regular email/password authentication
- Users can have both Google OAuth and traditional accounts (different emails)
- Profile pictures are automatically updated from Google if changed

## Client-Side Integration Example

```javascript
// Example client-side integration (pseudo-code)
async function handleGoogleLogin(idToken) {
  try {
    const response = await fetch("/api/auth/google", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token: idToken }),
    });

    const data = await response.json();

    if (data.success) {
      // Store JWT token
      localStorage.setItem("authToken", data.data.token);
      // Handle successful login
      console.log("User:", data.data.user);
    }
  } catch (error) {
    console.error("Login failed:", error);
  }
}
```
