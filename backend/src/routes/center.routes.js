import express from "express";
import {
  createCenter,
  getCenters,
  getCenterById,
  updateCenter,
  deleteCenter,
} from "../controllers/center.controller.js";

import { protect } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

const router = express.Router();

// 👑 Only admin can create
router.post("/", protect, allowRoles("super_admin", "counselor"), createCenter);

// 👀 Both can view
router.get("/", protect, getCenters);
router.get("/:id", protect, getCenterById);

// 👑 Only admin
router.put("/:id", protect, allowRoles("super_admin"), updateCenter);
router.delete("/:id", protect, allowRoles("super_admin"), deleteCenter);

export default router;