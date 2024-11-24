import { Router } from "express";
import {
  bookmarkComment,
  createComment,
  deleteComment,
  getComments,
  likeComment,
  unbookmarkComment,
  unlikeComment,
} from "../controllers/commentController";
import { authenticate } from "../auth/authMiddleware";
const router = Router();

// general CRUD
router.post("/", authenticate, createComment);
router.get("/:id", authenticate, getComments);
router.delete("/:id", authenticate, deleteComment);

// likes
router.post("/:id/like", authenticate, likeComment);
router.post("/:id/unlike", authenticate, unlikeComment);

// bookmarks
router.post("/:id/bookmark", authenticate, bookmarkComment);
router.post("/:id/unbookmark", authenticate, unbookmarkComment);

export default router;
