import { Router } from "express";
import {
  registerUser,
  loginUser,
  refreshToken,
} from "../controllers/authController";

const router = Router();

// Define routes
router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/refresh-token", refreshToken);

export default router;
