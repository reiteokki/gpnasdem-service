import { Router } from "express";
import {
  followUser,
  getAllUsers,
  getFollowers,
  getFollowing,
  getUserById,
  registerAsMember,
  unfollowUser,
  updateProfile,
} from "../controllers/userController";
import { authenticate } from "../auth/authMiddleware";
import upload from "../middleware/fileUpload";

const router = Router();

router.get("/", authenticate, getAllUsers);
router.post("/register-member", upload, authenticate, registerAsMember);
router.get("/:id", authenticate, getUserById);
router.put("/profile/:id", upload, authenticate, updateProfile);
router.post("/follow/:followingId", authenticate, followUser);
router.delete("/unfollow/:followingId", authenticate, unfollowUser);
router.get("/:id/followers", authenticate, getFollowers);
router.get("/:id/following", authenticate, getFollowing);

export default router;
