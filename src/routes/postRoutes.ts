import { Router } from "express";
import {
  bookmarkPost,
  createPost,
  deletePost,
  getPostById,
  getPosts,
  likePost,
  repostOrQuote,
  unbookmarkPost,
  unlikePost,
  unrepostOrUnquote,
  updatePost,
} from "../controllers/postController";
import { authenticate } from "../auth/authMiddleware";
import upload from "../middleware/fileUpload";
import { getPollResults, submitVote } from "../controllers/pollingController";

const router = Router();

// general CRUD
router.post("/create", upload, authenticate, createPost);
router.get("/", authenticate, getPosts);
router.get("/:id", authenticate, getPostById);
router.put("/:id", upload, authenticate, updatePost);
router.delete("/:id", upload, authenticate, deletePost);

// polling
router.post("/polling/vote", authenticate, submitVote);
router.get("/polling/:id", authenticate, getPollResults);

// likes
router.post("/:id/like", authenticate, likePost);
router.post("/:id/unlike", authenticate, unlikePost);

// quote/repost
router.post("/repost-quote", authenticate, repostOrQuote);
router.post("/unrepost-unquote", authenticate, unrepostOrUnquote);

// bookmarks
router.post("/:id/bookmark", authenticate, bookmarkPost);
router.post("/:id/unbookmark", authenticate, unbookmarkPost);

export default router;
