const { Storage } = require("@google-cloud/storage");

const storage = new Storage({
  keyFilename: "service-account-key.json", // Path to your service account key file
});

async function listBuckets() {
  console.log("Attempting to list buckets...");
  try {
    const [buckets] = await storage.getBuckets();
    console.log("Buckets in your project:");
    buckets.forEach(bucket => console.log(bucket.name));
  } catch (error) {
    console.error("Error listing buckets:", error);
  }
}

listBuckets();
console.log("Script execution complete.");
