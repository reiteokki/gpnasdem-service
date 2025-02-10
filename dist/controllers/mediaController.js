"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadPostMedia = void 0;
const uuid_1 = require("uuid");
const supabaseStorage_1 = require("../utils/supabaseStorage");
const db_1 = __importDefault(require("../db"));
const uploadPostMedia = (client, postId, files) => __awaiter(void 0, void 0, void 0, function* () {
    const bucketName = "post-media";
    const insertMediaQuery = `
    INSERT INTO post_media (id, post_id, url, type, size)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *;
  `;
    const uploadedMedia = [];
    for (const file of files) {
        try {
            // Upload file to storage
            const mediaPath = `posts/${postId}/${Date.now()}_${file.originalname}`;
            const mediaUrl = yield (0, supabaseStorage_1.uploadFile)(client, bucketName, file.buffer, mediaPath);
            if (!mediaUrl) {
                console.error("Failed to upload media file:", file.originalname);
                continue; // Skip this file if the upload fails
            }
            // Insert media metadata into the database
            const mediaId = (0, uuid_1.v4)();
            const mediaType = file.mimetype.split("/")[0]; // e.g., "image", "video"
            const mediaSize = file.size;
            const mediaResult = yield db_1.default.query(insertMediaQuery, [
                mediaId,
                postId,
                mediaUrl,
                mediaType,
                mediaSize,
            ]);
            uploadedMedia.push(mediaResult.rows[0]);
        }
        catch (err) {
            console.error("Error uploading media file:", err);
        }
    }
    return uploadedMedia;
});
exports.uploadPostMedia = uploadPostMedia;
