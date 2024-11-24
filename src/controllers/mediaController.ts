import { SupabaseClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";
import { uploadFile } from "../utils/supabaseStorage";
import pool from "../db";

export const uploadPostMedia = async (
  client: SupabaseClient,
  postId: string,
  files: Express.Multer.File[]
) => {
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
      const mediaUrl = await uploadFile(
        client,
        bucketName,
        file.buffer,
        mediaPath
      );

      if (!mediaUrl) {
        console.error("Failed to upload media file:", file.originalname);
        continue; // Skip this file if the upload fails
      }

      // Insert media metadata into the database
      const mediaId = uuidv4();
      const mediaType = file.mimetype.split("/")[0]; // e.g., "image", "video"
      const mediaSize = file.size;

      const mediaResult = await pool.query(insertMediaQuery, [
        mediaId,
        postId,
        mediaUrl,
        mediaType,
        mediaSize,
      ]);

      uploadedMedia.push(mediaResult.rows[0]);
    } catch (err) {
      console.error("Error uploading media file:", err);
    }
  }

  return uploadedMedia;
};
