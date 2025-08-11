# Frontend Integration with CloudNest Storage API

This guide explains how to integrate with CloudNest's backend storage system, including how to handle CORS issues with Cloudflare R2.

## File Access Routes

CloudNest offers multiple ways to access files:

### 1. Proxy Endpoint (RECOMMENDED)

**Endpoint**: `/api/files/proxy/:filename`

This is the **recommended approach** for accessing files from the frontend as it avoids CORS issues with Cloudflare R2. The backend will proxy the file content through the server, which ensures:

- CORS issues are eliminated (backend handles the request to R2)
- Authentication is properly checked (private files remain private)
- Content is streamed efficiently
- Proper content-type headers are set

**Example usage:**

```javascript
// Access public file
const publicFileUrl = `${API_BASE_URL}/api/files/proxy/myPublicFile.jpg`;

// Access private file (requires authentication)
const privateFileUrl = `${API_BASE_URL}/api/files/proxy/myPrivateFile.pdf`;
fetch(privateFileUrl, {
  headers: {
    'Authorization': `Bearer ${userToken}`
  }
})
.then(response => {
  if (!response.ok) throw new Error('Authentication required');
  return response.blob();
})
.then(blob => {
  // Handle file blob
});
```

### 2. Redirect Endpoint

**Endpoint**: `/api/files/access/:filename`

This endpoint redirects to a Cloudflare R2 URL. It works well for direct links but may have CORS issues when accessed programmatically from frontend code.

- Public files: Redirects to permanent R2 URL
- Private files: Redirects to temporary presigned URL (1-hour validity)

**Example usage:**

```javascript
// Direct link in HTML (works fine for downloads/new tabs)
<a href="${API_BASE_URL}/api/files/access/myFile.pdf" target="_blank">Download</a>

// May have CORS issues when used with fetch/axios
```

## File Operations

### Upload File

**Endpoint**: `POST /api/files/upload`

Uploads a file to the storage system.

```javascript
const formData = new FormData();
formData.append('file', fileObject);

// Optional: set public access flag
formData.append('isPublic', 'true'); // or 'false'

fetch(`${API_BASE_URL}/api/files/upload`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${userToken}`
  },
  body: formData
})
.then(response => response.json())
.then(data => {
  console.log('Upload success:', data);
})
.catch(error => {
  console.error('Upload failed:', error);
});
```

### List All Files

**Endpoint**: `GET /api/files`

Retrieves a list of files belonging to the authenticated user.

```javascript
fetch(`${API_BASE_URL}/api/files`, {
  headers: {
    'Authorization': `Bearer ${userToken}`
  }
})
.then(response => response.json())
.then(data => {
  console.log('Files:', data.files);
  console.log('Pagination:', data.pagination);
});
```

### Search Files

**Endpoint**: `GET /api/files/search?keyword=example`

Search for files by filename or original name.

```javascript
fetch(`${API_BASE_URL}/api/files/search?keyword=example`, {
  headers: {
    'Authorization': `Bearer ${userToken}`
  }
})
.then(response => response.json())
.then(data => {
  console.log('Search results:', data);
});
```

### Delete File

**Endpoint**: `DELETE /api/files/:id`

Delete a file by its ID.

```javascript
fetch(`${API_BASE_URL}/api/files/60d21b4667d0d8992e610c85`, {
  method: 'DELETE',
  headers: {
    'Authorization': `Bearer ${userToken}`
  }
})
.then(response => response.json())
.then(data => {
  console.log('File deleted:', data);
});
```

### Update File Public Status

**Endpoint**: `PUT /api/files/:id/public`

Update whether a file is publicly accessible.

```javascript
fetch(`${API_BASE_URL}/api/files/60d21b4667d0d8992e610c85/public`, {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${userToken}`
  },
  body: JSON.stringify({ isPublic: true })
})
.then(response => response.json())
.then(data => {
  console.log('File updated:', data);
});
```

### Update File Tags

**Endpoint**: `PUT /api/files/:id/tags`

Update a file's tags.

```javascript
fetch(`${API_BASE_URL}/api/files/60d21b4667d0d8992e610c85/tags`, {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${userToken}`
  },
  body: JSON.stringify({ tags: ['important', 'document', 'personal'] })
})
.then(response => response.json())
.then(data => {
  console.log('Tags updated:', data);
});
```

## Handling CORS with Image Elements

When displaying images in your frontend that are stored in Cloudflare R2, always use the proxy endpoint:

```html
<!-- CORRECT: Uses proxy endpoint, avoids CORS issues -->
<img src="${API_BASE_URL}/api/files/proxy/image.jpg" alt="My Image" />

<!-- INCORRECT: Will likely have CORS issues -->
<img src="https://your-r2-bucket.r2.dev/image.jpg" alt="My Image" />
```

## Authentication

All API calls that require authentication should include a JWT token in the Authorization header:

```javascript
const headers = {
  'Authorization': `Bearer ${userToken}`
};
```

The token is obtained from the login endpoint and should be stored securely in your frontend application.
