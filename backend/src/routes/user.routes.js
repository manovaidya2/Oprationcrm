import express from "express";
import { createCounselor } from "../controllers/user.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

const router = express.Router();

// 👑 Only super admin can create counselor
router.post(
  "/create-counselor",
  protect,
  allowRoles("super_admin"),
  createCounselor
);

export default router;