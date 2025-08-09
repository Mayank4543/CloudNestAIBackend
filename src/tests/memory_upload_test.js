// Test script for memory storage upload to R2
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");

// Configuration
const API_URL = "http://localhost:4000"; // Adjust if using a different port
const TEST_IMAGE_PATH = path.join(__dirname, "test_image.jpg");
const AUTH_TOKEN = ""; // Add your auth token here

// Helper function to sleep
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Main test function
async function testMemoryUpload() {
  try {
    console.log("🧪 Starting memory upload test...");
    console.log(`📁 Using test image: ${TEST_IMAGE_PATH}`);

    // Check if test image exists
    if (!fs.existsSync(TEST_IMAGE_PATH)) {
      console.error("❌ Test image not found!");
      return;
    }

    // Create form data with file
    const form = new FormData();
    form.append("file", fs.createReadStream(TEST_IMAGE_PATH));
    form.append("isPublic", "true"); // Make the file public for easier testing

    console.log("🚀 Uploading file...");

    // Upload file
    const uploadResponse = await axios.post(
      `${API_URL}/api/files/upload`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${AUTH_TOKEN}`,
        },
      }
    );

    console.log("✅ Upload successful!");
    console.log(
      "📄 File details:",
      JSON.stringify(uploadResponse.data, null, 2)
    );

    // Extract file URL and ID
    const { url, id } = uploadResponse.data.data;

    console.log(`🔗 File URL: ${url}`);
    console.log(`🆔 File ID: ${id}`);

    // Try to access the file
    console.log("🔍 Checking file access...");

    // Wait a moment to ensure R2 has processed the upload
    await sleep(2000);

    try {
      const accessResponse = await axios.get(url);
      console.log(
        `✅ File access successful! Status: ${accessResponse.status}`
      );
      console.log(`📊 Content type: ${accessResponse.headers["content-type"]}`);
      console.log(
        `📏 Content length: ${accessResponse.headers["content-length"]} bytes`
      );
    } catch (accessError) {
      console.error("❌ File access failed:", accessError.message);
      if (accessError.response) {
        console.error("Status:", accessError.response.status);
        console.error("Headers:", accessError.response.headers);
      }
    }

    // Try to get file by ID
    console.log("🔍 Fetching file by ID...");
    try {
      const fileResponse = await axios.get(`${API_URL}/api/files/${id}`, {
        headers: {
          Authorization: `Bearer ${AUTH_TOKEN}`,
        },
      });
      console.log("✅ File fetch successful!");
      console.log(
        "📄 File details:",
        JSON.stringify(fileResponse.data, null, 2)
      );
    } catch (fileError) {
      console.error("❌ File fetch failed:", fileError.message);
    }

    console.log("✨ Test completed!");
  } catch (error) {
    console.error("❌ Test failed with error:", error.message);
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Response data:", error.response.data);
    }
  }
}

// Run the test
testMemoryUpload().catch(console.error);
