"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const multer_1 = __importDefault(require("multer"));
const storage = multer_1.default.memoryStorage();
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // Limit file size to 5MB
});
exports.default = upload.fields([
    { name: "id_card", maxCount: 1 },
    { name: "avatar", maxCount: 1 },
    { name: "cover", maxCount: 1 },
    { name: "media", maxCount: 10 },
]);
