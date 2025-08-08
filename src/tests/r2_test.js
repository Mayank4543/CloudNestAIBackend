const axios = require("axios");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");

// Configuration
const API_URL = "http://localhost:4000/api";
let authToken = "";

// Function to authenticate
async function login() {
  try {
    // Replace with your actual login credentials
    const response = await axios.post(`${API_URL}/auth/login`, {
      email: "deployment24@gamil.com",
      password: "password",
    });

    if (response.data.success) {
      authToken = response.data.data.token;
      console.log("✅ Authentication successful");
      return true;
    } else {
      console.error("❌ Authentication failed:", response.data.message);
      return false;
    }
  } catch (error) {
    console.error(
      "❌ Authentication error:",
      error.response?.data?.message || error.message
    );
    return false;
  }
}

// Function to upload a test file
async function uploadFile(filePath) {
  try {
    // Create form data
    const form = new FormData();
    form.append("file", fs.createReadStream(filePath));
    form.append("isPublic", "true"); // Make the file public for easy testing

    // Upload the file
    const response = await axios.post(`${API_URL}/files/upload`, form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${authToken}`,
      },
    });

    if (response.data.success) {
      console.log("✅ File uploaded successfully");
      console.log(
        "📄 File details:",
        JSON.stringify(response.data.data, null, 2)
      );

      // Check if R2 storage was used
      if (response.data.data.storedInR2) {
        console.log("🌩️ File was stored in Cloudflare R2");
        console.log("🔗 R2 URL:", response.data.data.url);
      } else {
        console.log("💾 File was stored locally (R2 storage was not used)");
      }

      return response.data.data;
    } else {
      console.error("❌ Upload failed:", response.data.message);
      return null;
    }
  } catch (error) {
    console.error(
      "❌ Upload error:",
      error.response?.data?.message || error.message
    );
    return null;
  }
}

// Function to test accessing a file
async function testFileAccess(fileData) {
  try {
    console.log("🧪 Testing file access...");

    // Method 1: Test direct R2 URL (should fail if bucket is private)
    try {
      console.log("🧪 Testing direct R2 URL:", fileData.url);
      const directResponse = await axios.get(fileData.url);
      console.log("✅ Direct R2 access successful (bucket may be public)");
      console.log("🔍 Response status:", directResponse.status);
    } catch (directError) {
      console.log("ℹ️ Direct R2 access failed as expected (bucket is private)");
    }

    // Method 2: Test access through our server's file access route with authentication
    const accessUrl = `${API_URL}/files/access/${fileData.filename}`;
    console.log("🧪 Testing file access through server route:", accessUrl);

    const response = await axios.get(accessUrl, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      maxRedirects: 0, // Don't follow redirects
      validateStatus: (status) => status >= 200 && status < 400, // Accept 3xx redirect status
    });

    if (response.status >= 300 && response.status < 400) {
      console.log("✅ Server returned redirect as expected");
      console.log("🔄 Redirect URL:", response.headers.location);

      // Now follow the redirect manually to test the presigned URL
      try {
        const finalResponse = await axios.get(response.headers.location);
        console.log("✅ Accessing file through presigned URL successful");
        console.log("🔍 Final response status:", finalResponse.status);
        console.log("📊 Content type:", finalResponse.headers["content-type"]);
      } catch (redirectError) {
        console.error("❌ Following redirect failed:", redirectError.message);
        return false;
      }
    } else {
      console.log("✅ File access successful");
      console.log("🔍 Response status:", response.status);
      console.log("📊 Content type:", response.headers["content-type"]);
    }

    return true;
  } catch (error) {
    console.error(
      "❌ File access error:",
      error.response?.data?.message || error.message
    );
    console.error("❌ Status code:", error.response?.status);
    return false;
  }
}

// Main test function
async function runTest() {
  console.log("🚀 Starting R2 upload test...");

  // Step 1: Login
  const loginSuccess = await login();
  if (!loginSuccess) {
    console.error("❌ Test aborted due to authentication failure");
    return;
  }

  // Step 2: Upload a test file
  // Replace with a path to an existing test file
  const testFilePath = path.join(__dirname, "test_image.jpg");

  // Check if test file exists
  if (!fs.existsSync(testFilePath)) {
    console.error(`❌ Test file not found at ${testFilePath}`);
    console.log("💡 Create a test file or update the path in the script");
    return;
  }

  // Upload the file
  const uploadedFile = await uploadFile(testFilePath);
  if (!uploadedFile) {
    console.error("❌ Test aborted due to upload failure");
    return;
  }

  // Step 3: Test accessing the file
  await testFileAccess(uploadedFile);

  console.log("🏁 Test completed");
}

// Run the test
runTest().catch((error) => {
  console.error("❌ Unexpected error:", error);
});
