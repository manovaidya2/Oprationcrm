import express from "express";
import { uploadCenterDocument } from "../controllers/document.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { upload } from "../middleware/upload.middleware.js";

const router = express.Router();

router.post(
  "/center",
  protect,
  upload.single("file"),
  uploadCenterDocument
);

export default router;