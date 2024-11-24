import { Router } from "express";
import {
  createForum,
  getForumById,
  editForum,
  deleteForum,
  followForum,
  approveJoinRequest,
} from "../controllers/forumController";
import { authenticate } from "../auth/authMiddleware";
import upload from "../middleware/fileUpload";
const router = Router();

router.post("/", upload, authenticate, createForum);
router.post("/:forumId/join", authenticate, followForum);
router.put("/:forumId/approve", authenticate, approveJoinRequest);
router.get("/:id", authenticate, getForumById);
router.put("/:id", upload, authenticate, editForum);
router.delete("/:id", authenticate, deleteForum);

export default router;
