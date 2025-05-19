const functions = require("firebase-functions");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { Storage } = require("@google-cloud/storage");

const app = express();
app.use(cors());
const upload = multer({ storage: multer.memoryStorage() });
const storage = new Storage();
const bucket = storage.bucket("veryusduet.appspot.com");

app.post("/uploads", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).send("파일 없음");

  const filename = `uploads/${Date.now()}_${req.file.originalname}`;
  const file = bucket.file(filename);

  await file.save(req.file.buffer, {
    metadata: { contentType: req.file.mimetype },
    public: true,
  });

  const publicUrl = `https://firebasestorage.googleapis.com/v0/b/veryusduet.appspot.com/o/${encodeURIComponent(filename)}?alt=media`;
  res.json({ url: publicUrl });
});

// 이 코드가 필요함
exports.api = functions.https.onRequest(app);
