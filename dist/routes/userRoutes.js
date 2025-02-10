"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const userController_1 = require("../controllers/userController");
const authMiddleware_1 = require("../auth/authMiddleware");
const fileUpload_1 = __importDefault(require("../middleware/fileUpload"));
const router = (0, express_1.Router)();
router.get("/", authMiddleware_1.authenticate, userController_1.getAllUsers);
router.post("/register-member", fileUpload_1.default, authMiddleware_1.authenticate, userController_1.registerAsMember);
router.get("/:id", authMiddleware_1.authenticate, userController_1.getUserById);
router.put("/profile/:id", fileUpload_1.default, authMiddleware_1.authenticate, userController_1.updateProfile);
router.post("/follow/:followingId", authMiddleware_1.authenticate, userController_1.followUser);
router.delete("/unfollow/:followingId", authMiddleware_1.authenticate, userController_1.unfollowUser);
router.get("/:id/followers", authMiddleware_1.authenticate, userController_1.getFollowers);
router.get("/:id/following", authMiddleware_1.authenticate, userController_1.getFollowing);
// admin
router.get("/registrant/:id", authMiddleware_1.authenticate, userController_1.getRegistrantById);
router.patch("/registrant/accept-member/:id", authMiddleware_1.authenticate, userController_1.acceptAsMember);
router.post("/toggle-admin/:id", authMiddleware_1.authenticate, userController_1.toggleAdminStatus);
exports.default = router;
