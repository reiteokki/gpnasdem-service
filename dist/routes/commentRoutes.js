"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const commentController_1 = require("../controllers/commentController");
const authMiddleware_1 = require("../auth/authMiddleware");
const router = (0, express_1.Router)();
// general CRUD
router.post("/", authMiddleware_1.authenticate, commentController_1.createComment);
router.get("/:id", authMiddleware_1.authenticate, commentController_1.getComments);
router.delete("/:id", authMiddleware_1.authenticate, commentController_1.deleteComment);
// likes
router.post("/:id/like", authMiddleware_1.authenticate, commentController_1.likeComment);
router.post("/:id/unlike", authMiddleware_1.authenticate, commentController_1.unlikeComment);
// bookmarks
router.post("/:id/bookmark", authMiddleware_1.authenticate, commentController_1.bookmarkComment);
router.post("/:id/unbookmark", authMiddleware_1.authenticate, commentController_1.unbookmarkComment);
exports.default = router;
