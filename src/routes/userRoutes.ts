import { Router } from "express";
import {
  acceptAsMember,
  followUser,
  getAllUsers,
  getFollowers,
  getFollowing,
  getRegistrantById,
  getUserById,
  registerAsMember,
  toggleAdminStatus,
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

// admin
router.get("/registrant/:id", authenticate, getRegistrantById);
router.patch("/registrant/accept-member/:id", authenticate, acceptAsMember);
router.post("/toggle-admin/:id", authenticate, toggleAdminStatus);

export default router;
