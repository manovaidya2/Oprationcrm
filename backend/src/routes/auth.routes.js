import express from "express";
import { login, seedAdmin } from "../controllers/auth.controller.js";

const router = express.Router();

// TEST
router.post("/seed-admin", seedAdmin);

// LOGIN
router.post("/login", login);

export default router;