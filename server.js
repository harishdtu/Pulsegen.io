// Import required packages
const express = require("express");   // Express framework to build web server and API routes
const axios = require("axios");       // Axios is used to make HTTP requests (to G2 API)
const bodyParser = require("body-parser"); // Middleware to parse JSON request body
const path = require("path");         // Built-in Node.js module for file and directory paths

// Create Express app
const app = express();

// Middleware setup
app.use(bodyParser.json()); // Allows Express to parse JSON data in POST requests
app.use(express.static(path.join(__dirname, "public"))); 
// ✅ Serves static files (like HTML, CSS, JS) from the "public" folder

// 🔑 Your G2 API token (replace with your actual token from G2)
const G2_API_TOKEN = "af45bd1643791b570d77c4fdf0787338599ea96b00be9cea4441e117e0999d41";

// 🌐 G2 API endpoints
const G2_PRODUCT_URL = "https://data.g2.com/api/v2/products";            // For product info (UUID lookup)
const G2_REVIEWS_URL = "https://data.g2.com/api/v2/syndication/reviews"; // For fetching product reviews

// 🔎 Helper function: Convert product slug → UUID
// Example: "slack" → "a7d324a4-06eb-4be2-ad8e-65938bce5fd5"
async function resolveProductId(slug) {
  const resp = await axios.get(G2_PRODUCT_URL, {
    headers: {
      Authorization: `Bearer ${G2_API_TOKEN}`, // ✅ Send token to authenticate
      Accept: "application/json",              // Ask for JSON response
    },
    params: {
      "filter[slug]": slug.toLowerCase(),      // Pass the slug as filter (slug = product name in URL form)
    },
  });

  // If a matching product is found, return its UUID
  if (resp.data?.data?.length > 0) {
    return resp.data.data[0].id; // G2 returns "id" as UUID
  } else {
    // If not found, log full response for debugging
    console.error("G2 API response for slug:", slug, JSON.stringify(resp.data, null, 2));
    throw new Error(`Product not found for slug: ${slug}`);
  }
}

// 📌 API Route: Scrape reviews from G2
app.post("/scrape", async (req, res) => {
  const { company, startDate, endDate, source } = req.body; 
  // Expecting body: { company: "slack", startDate: "2024-01-01", endDate: "2024-12-31", source: "G2" }

  // 1. Validate inputs
  if (!company) {
    return res.status(400).json({ error: "Company (slug or ID) is required" });
  }
  if (source.toLowerCase() !== "g2") {
    return res.status(400).json({ error: "Only G2 source is currently supported" });
  }

  try {
    // 2. Step 1: Resolve slug → Product UUID (only if user provided slug)
    let productId = company;
    if (!company.includes("-")) { // G2 UUIDs usually contain "-" (hyphen). If not, assume it's a slug.
      console.log(`Resolving slug → UUID: ${company}`);
      productId = await resolveProductId(company); // Call helper to get UUID
      console.log("✅ Resolved Product ID:", productId);
    } else {
      console.log(`Using raw product ID: ${company}`);
    }

    // 3. Step 2: Fetch reviews from G2
    const response = await axios.get(G2_REVIEWS_URL, {
      headers: {
        Authorization: `Bearer ${G2_API_TOKEN}`, // API authentication
        Accept: "application/json",              // JSON response
      },
      params: {
        "filter[product_id]": productId, // Filter reviews by resolved product ID
        "page[size]": 25,                // Limit to 25 reviews per page
        "page[number]": 1,               // Start with page 1
      },
    });

    console.log("✅ G2 API Status:", response.status); // Should log 200 if success
    console.log("✅ Reviews Returned:", response.data?.data?.length || 0);

    // 4. Step 3: Filter reviews by date range (if startDate / endDate provided)
    let reviews = response.data.data || [];
    if (startDate || endDate) {
      reviews = reviews.filter((review) => {
        const createdAt = new Date(review.attributes.created_at); // Each review has created_at date
        const afterStart = startDate ? createdAt >= new Date(startDate) : true;
        const beforeEnd = endDate ? createdAt <= new Date(endDate) : true;
        return afterStart && beforeEnd;
      });
    }

    // Send reviews back to frontend
    res.json({ reviews });

  } catch (error) {
    // Handle errors gracefully
    console.error("❌ Error fetching reviews:", error.response?.status, error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch reviews from G2 API" });
  }
});

// 📄 Serve frontend (index.html)
app.get("/", (req, res) => {
  const indexPath = path.join(__dirname, "public", "index.html");
  res.sendFile(indexPath); // Send index.html when visiting root URL
});

// 🚀 Start Express server
const PORT = process.env.PORT || 3000; // Use environment PORT or default to 3000
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
