"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const postController_1 = require("../controllers/postController");
const authMiddleware_1 = require("../auth/authMiddleware");
const fileUpload_1 = __importDefault(require("../middleware/fileUpload"));
const pollingController_1 = require("../controllers/pollingController");
const router = (0, express_1.Router)();
// general CRUD
router.post("/create", fileUpload_1.default, authMiddleware_1.authenticate, postController_1.createPost);
router.get("/", authMiddleware_1.authenticate, postController_1.getPosts);
router.get("/:id", authMiddleware_1.authenticate, postController_1.getPostById);
router.put("/:id", fileUpload_1.default, authMiddleware_1.authenticate, postController_1.updatePost);
router.delete("/:id", fileUpload_1.default, authMiddleware_1.authenticate, postController_1.deletePost);
// polling
router.post("/polling/vote", authMiddleware_1.authenticate, pollingController_1.submitVote);
router.get("/polling/:id", authMiddleware_1.authenticate, pollingController_1.getPollResults);
// likes
router.post("/:id/like", authMiddleware_1.authenticate, postController_1.likePost);
router.post("/:id/unlike", authMiddleware_1.authenticate, postController_1.unlikePost);
// quote/repost
router.post("/repost-quote", authMiddleware_1.authenticate, postController_1.repostOrQuote);
router.post("/unrepost-unquote", authMiddleware_1.authenticate, postController_1.unrepostOrUnquote);
// bookmarks
router.post("/:id/bookmark", authMiddleware_1.authenticate, postController_1.bookmarkPost);
router.post("/:id/unbookmark", authMiddleware_1.authenticate, postController_1.unbookmarkPost);
exports.default = router;
