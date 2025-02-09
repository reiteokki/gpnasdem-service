import { Router } from "express";
import {
  createForum,
  getAllForums,
  getJoinedForums,
  getForumById,
  editForum,
  deleteForum,
  followForum,
  approveJoinRequest,
  unfollowForum,
} from "../controllers/forumController";
import { authenticate } from "../auth/authMiddleware";
import upload from "../middleware/fileUpload";
const router = Router();

router.post("/", upload, authenticate, createForum);
router.post("/:forumId/join", authenticate, followForum);
router.post("/:forumId/leave", authenticate, unfollowForum);
router.put("/:forumId/approve", authenticate, approveJoinRequest);
router.get("/", upload, authenticate, getAllForums);
router.get("/joined", upload, authenticate, getJoinedForums);
router.get("/:id", authenticate, getForumById);
router.put("/:id", upload, authenticate, editForum);
router.delete("/:id", authenticate, deleteForum);

export default router;
