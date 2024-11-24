import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import pool from "../db";
import { uploadPostMedia } from "./mediaController";
import { SupabaseClient } from "@supabase/supabase-js";
import { deleteFile, uploadFile } from "../utils/supabaseStorage";

export const createPost = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.userId; // Extracted from JWT middleware
  const {
    forumId,
    type,
    content,
    title,
    startDateTime,
    endDateTime,
    isAnonymous,
    allowMultipleChoices,
    pollingOptions,
  } = req.body;

  const mediaFiles = (req.files as { media?: Express.Multer.File[] })?.media;

  // Validate type
  if (!type || !["personal", "article", "polling"].includes(type)) {
    res.status(400).json({ message: "Invalid or missing post type." });
    return;
  }

  if (forumId) {
    // Check if the requesting user is a core member of the forum
    const coreCheckQuery = `
      SELECT role
      FROM forum_members
      WHERE forum_id = $1 AND user_id = $2;
    `;
    const coreCheckResult = await pool.query(coreCheckQuery, [forumId, userId]);

    if (
      coreCheckResult.rows.length === 0 ||
      coreCheckResult.rows[0].role === "core"
    ) {
      res
        .status(403)
        .json({ message: "Only core members can post in a forum." });
      return;
    }
  }

  try {
    // Generate a new UUID for the post
    const postId = uuidv4();

    // Insert the post into the `posts` table
    const insertPostQuery = `
      INSERT INTO posts (id, user_id, forum_id, type)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const postResult = await pool.query(insertPostQuery, [
      postId,
      userId,
      forumId || null,
      type,
    ]);

    if (postResult.rowCount === 0) {
      res
        .status(500)
        .json({ message: "Failed to create post in posts table." });
      return;
    }

    // Handle post type-specific data
    let additionalData: Record<string, any> = {};

    switch (type) {
      case "personal":
        if (!content || content.trim() === "") {
          res
            .status(400)
            .json({ message: "Content is required for a personal post." });
          return;
        }
        const insertPersonalQuery = `
          INSERT INTO posts_personal (post_id, content)
          VALUES ($1, $2)
          RETURNING *;
        `;
        const personalResult = await pool.query(insertPersonalQuery, [
          postId,
          content,
        ]);
        if (personalResult.rowCount === 0) {
          res.status(500).json({
            message: "Failed to create personal post in posts_personal table.",
          });
          return;
        }
        additionalData = personalResult.rows[0];

        // Upload media files (if any)
        if (mediaFiles && mediaFiles.length > 0) {
          const uploadedMedia = await uploadPostMedia(
            req.supabase,
            postId,
            mediaFiles
          );
          additionalData.media = uploadedMedia;
        }
        break;

      case "article":
        if (!title || !content) {
          res.status(400).json({
            message: "Title and content are required for an article post.",
          });
          return;
        }
        const insertArticleQuery = `
          INSERT INTO posts_article (post_id, title, content)
          VALUES ($1, $2, $3)
          RETURNING *;
        `;
        const articleResult = await pool.query(insertArticleQuery, [
          postId,
          title,
          content,
        ]);
        if (articleResult.rowCount === 0) {
          res.status(500).json({
            message: "Failed to create article post in posts_article table.",
          });
          return;
        }
        additionalData = articleResult.rows[0];
        break;

      case "polling":
        if (
          !startDateTime ||
          !endDateTime ||
          !pollingOptions ||
          pollingOptions.length === 0
        ) {
          res.status(400).json({
            message:
              "Start date, end date, and polling options are required for a polling post.",
          });
          return;
        }
        const insertPollingQuery = `
          INSERT INTO posts_polling (post_id, start_datetime, end_datetime, is_anonymous, allow_multiple_choices)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *;
        `;
        const pollingResult = await pool.query(insertPollingQuery, [
          postId,
          startDateTime,
          endDateTime,
          isAnonymous || false,
          allowMultipleChoices || false,
        ]);
        if (pollingResult.rowCount === 0) {
          res.status(500).json({
            message: "Failed to create polling post in posts_polling table.",
          });
          return;
        }

        const insertOptionsQuery = `
          INSERT INTO polling_options (id, polling_post_id, text)
          VALUES ($1, $2, $3)
          RETURNING *;
        `;
        const optionsData = [];
        for (const optionText of pollingOptions) {
          const optionId = uuidv4();
          const optionResult = await pool.query(insertOptionsQuery, [
            optionId,
            postId,
            optionText,
          ]);
          if (optionResult.rowCount && optionResult.rowCount > 0) {
            optionsData.push(optionResult.rows[0]);
          }
        }

        if (optionsData.length === 0) {
          res.status(500).json({
            message: "Failed to create poll options in polling_options table.",
          });
          return;
        }

        res.status(201).json({
          post: postResult.rows[0],
          poll: pollingResult.rows[0],
          options: optionsData,
        });

        additionalData = { ...pollingResult.rows[0], options: optionsData };
        break;

      default:
        res.status(400).json({ message: "Invalid post type." });
        return;
    }

    // Return the created post
    res.status(201).json({
      post: postResult.rows[0],
      additionalData,
    });
  } catch (error) {
    console.error("Error creating post:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};

export const getPosts = async (req: Request, res: Response): Promise<void> => {
  const {
    type,
    forumId,
    page = 1,
    limit = 10,
    lastCreatedAt,
    lastId,
  } = req.query;

  const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

  try {
    // Check if the forum_id exists (if provided)
    if (forumId) {
      const forumCheckQuery = `
        SELECT 1 FROM forums WHERE id = $1;
      `;
      const forumCheckResult = await pool.query(forumCheckQuery, [forumId]);
      if (forumCheckResult.rowCount === 0) {
        res.status(404).json({ message: "Forum ID does not exist." });
        return;
      }
    }

    // Get the total count of posts matching the filters
    const totalCountQuery = `
      SELECT COUNT(*) AS total
      FROM posts p
      WHERE ($1::TEXT IS NULL OR p.type = $1)
        AND ($2::UUID IS NULL OR p.forum_id = $2);
    `;
    const totalCountResult = await pool.query(totalCountQuery, [
      type || null,
      forumId || null,
    ]);
    const totalData = parseInt(totalCountResult.rows[0].total, 10);

    // Fetch paginated posts
    const postsQuery = `
      SELECT p.id, p.user_id, p.forum_id, p.type, p.created_at, p.updated_at,
             pp.content AS personal_content,
             po.title AS article_title,
             pol.start_datetime, pol.end_datetime
      FROM posts p
      LEFT JOIN posts_personal pp ON p.id = pp.post_id
      LEFT JOIN posts_article po ON p.id = po.post_id
      LEFT JOIN posts_polling pol ON p.id = pol.post_id
      WHERE ($1::TEXT IS NULL OR p.type = $1)
        AND ($2::UUID IS NULL OR p.forum_id = $2)
        AND (($3::TIMESTAMP IS NULL AND $4::UUID IS NULL) OR (p.created_at, p.id) < ($3, $4))
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT $5 OFFSET $6;
    `;

    const postsResult = await pool.query(postsQuery, [
      type || null, // Filter by type if provided
      forumId || null, // Filter by forum_id if provided
      lastCreatedAt || null, // For real-time pagination
      lastId || null, // For real-time pagination
      parseInt(limit as string), // Limit for pagination
      offset, // Offset for traditional pagination
    ]);

    res.status(200).json({
      posts: postsResult.rows,
      totalData, // Total number of posts matching the filters
      page: parseInt(page as string),
      limit: parseInt(limit as string),
    });
  } catch (err) {
    console.error("Error fetching posts:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const updatePost = async (
  req: Request,
  res: Response
): Promise<void> => {
  const client = req.supabase as SupabaseClient; // Supabase client from the request
  const userId = req.userId; // Extracted from JWT middleware
  const { id: postId } = req.params; // Post ID from request params
  const { content, title, previousMediaUrls } = req.body; // Data to update

  const mediaFiles = (req.files as { media?: Express.Multer.File[] })?.media;

  try {
    // Fetch the post to validate ownership and type
    const postQuery = `
      SELECT id, user_id, type
      FROM posts
      WHERE id = $1;
    `;
    const postResult = await pool.query(postQuery, [postId]);

    if (postResult.rowCount === 0) {
      res.status(404).json({ message: "Post not found." });
      return;
    }

    const post = postResult.rows[0];

    // Check if the user is an admin
    const isAdminQuery = `
    SELECT 1 
      FROM users_admin 
    WHERE user_id = $1`;

    const isAdminResult = await pool.query(isAdminQuery, [userId]);
    const isAdmin = isAdminResult?.rowCount && isAdminResult.rowCount > 0;

    // Only allow the post owner to update
    if (post.user_id !== userId || !isAdmin) {
      res
        .status(403)
        .json({ message: "You are not authorized to update this post." });
      return;
    }

    // Ensure only personal and article types can be updated
    if (!["personal", "article"].includes(post.type)) {
      res
        .status(400)
        .json({ message: "Only personal and article posts can be updated." });
      return;
    }

    // Start the update
    let additionalData: Record<string, any> = {};

    switch (post.type) {
      case "personal":
        if (content && content.trim() !== "") {
          const updatePersonalQuery = `
            UPDATE posts_personal
            SET content = $1
            WHERE post_id = $2
            RETURNING *;
          `;
          const personalResult = await pool.query(updatePersonalQuery, [
            content,
            postId,
          ]);

          if (personalResult.rowCount === 0) {
            res.status(500).json({
              message: "Failed to update personal post content.",
            });
            return;
          }

          additionalData = personalResult.rows[0];
        }
        break;

      case "article":
        if (
          !title ||
          !content ||
          title.trim() === "" ||
          content.trim() === ""
        ) {
          res.status(400).json({
            message:
              "Title and content are required to update an article post.",
          });
          return;
        }

        const updateArticleQuery = `
          UPDATE posts_article
          SET title = $1, content = $2
          WHERE post_id = $3
          RETURNING *;
        `;
        const articleResult = await pool.query(updateArticleQuery, [
          title,
          content,
          postId,
        ]);

        if (articleResult.rowCount === 0) {
          res.status(500).json({
            message: "Failed to update article post.",
          });
          return;
        }

        additionalData = articleResult.rows[0];
        break;

      default:
        res.status(400).json({ message: "Invalid post type for update." });
        return;
    }

    if (previousMediaUrls && Array.isArray(previousMediaUrls)) {
      for (const mediaUrl of previousMediaUrls) {
        await deleteFile(client, "post-media", mediaUrl); // Delete from bucket
      }

      // Remove from `post_media` table
      const deleteMediaQuery = `
        DELETE FROM post_media
        WHERE post_id = $1 AND url = ANY($2::text[]);
      `;
      await pool.query(deleteMediaQuery, [postId, previousMediaUrls]);
    }

    // Upload new media files if `mediaFiles` are passed
    if (mediaFiles && mediaFiles.length > 0) {
      const uploadedMediaUrls = [];
      for (const file of mediaFiles) {
        const mediaPath = `posts/${postId}/media/${Date.now()}_${
          file.originalname
        }`;
        const uploadedUrl = await uploadFile(
          client,
          "post-media",
          file.buffer,
          mediaPath
        );
        if (uploadedUrl) {
          uploadedMediaUrls.push(uploadedUrl);
        }
      }

      // Insert new media URLs into `post_media` table
      const insertMediaQuery = `
        INSERT INTO post_media (post_id, url)
        VALUES ($1, unnest($2::text[]));
      `;
      await pool.query(insertMediaQuery, [postId, uploadedMediaUrls]);
      additionalData.mediaUrls = uploadedMediaUrls;
    }

    // Fetch the updated post data
    const updatedPostQuery = `
      SELECT p.id, p.user_id, p.type, p.created_at, p.updated_at,
             pm.url AS media_url
      FROM posts p
      LEFT JOIN post_media pm ON p.id = pm.post_id
      WHERE p.id = $1;
    `;
    const updatedPostResult = await pool.query(updatedPostQuery, [postId]);

    res.status(200).json({
      message: "Post updated successfully.",
      post: updatedPostResult.rows,
      additionalData,
    });
  } catch (error) {
    console.error("Error updating post:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};

export const deletePost = async (
  req: Request,
  res: Response
): Promise<void> => {
  const client = req.supabase as SupabaseClient; // Supabase client from the request
  const userId = req.userId; // Extracted from JWT middleware
  const { id: postId } = req.params; // Post ID from request params

  try {
    // Check if the post exists and belongs to the user
    const postQuery = `
      SELECT id, user_id, forum_id, type
      FROM posts
      WHERE id = $1;
    `;
    const postResult = await pool.query(postQuery, [postId]);

    if (postResult.rowCount === 0) {
      res.status(404).json({ message: "Post not found." });
      return;
    }

    const post = postResult.rows[0];
    if (post.user_id !== userId) {
      res
        .status(403)
        .json({ message: "You are not authorized to delete this post." });
      return;
    }

    // Delete associated media files (if any)
    const mediaQuery = `
      SELECT id, url 
      FROM post_media
      WHERE post_id = $1;
    `;
    const mediaResult = await pool.query(mediaQuery, [postId]);

    if (mediaResult.rowCount && mediaResult.rowCount > 0) {
      const bucketName = "post-media"; // Bucket name for post media
      for (const media of mediaResult.rows) {
        await deleteFile(client, bucketName, media.url); // Delete the media file
      }
    }

    // Delete associated data in type-specific tables
    switch (post.type) {
      case "personal":
        await pool.query(`DELETE FROM posts_personal WHERE post_id = $1;`, [
          postId,
        ]);
        break;

      case "article":
        await pool.query(`DELETE FROM posts_article WHERE post_id = $1;`, [
          postId,
        ]);
        break;

      case "polling":
        // Delete polling votes
        await pool.query(
          `DELETE FROM polling_votes WHERE polling_post_id = $1;`,
          [postId]
        );

        // Delete polling options
        await pool.query(
          `DELETE FROM polling_options WHERE polling_post_id = $1;`,
          [postId]
        );

        // Delete polling post
        await pool.query(`DELETE FROM posts_polling WHERE post_id = $1;`, [
          postId,
        ]);
        break;

      default:
        // No specific cleanup for unknown types
        break;
    }

    // Delete the post itself
    const deletePostQuery = `
      DELETE FROM posts
      WHERE id = $1
      RETURNING *;
    `;
    const deleteResult = await pool.query(deletePostQuery, [postId]);

    if (deleteResult.rowCount === 0) {
      res.status(500).json({ message: "Failed to delete the post." });
      return;
    }

    res.status(200).json({ message: "Post deleted successfully." });
  } catch (error) {
    console.error("Error deleting post:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};

export const likePost = async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId;
  const { id: postId } = req.params;

  try {
    // Validate the post exists
    const postQuery = `
      SELECT id
      FROM posts
      WHERE id = $1;
    `;
    const postResult = await pool.query(postQuery, [postId]);

    if (postResult.rowCount === 0) {
      res.status(404).json({ message: "Post not found." });
      return;
    }

    // Check if the user already liked the post
    const likeExistsQuery = `
      SELECT id
      FROM post_likes
      WHERE user_id = $1 AND post_id = $2;
    `;
    const likeExistsResult = await pool.query(likeExistsQuery, [
      userId,
      postId,
    ]);

    if (likeExistsResult.rowCount && likeExistsResult.rowCount > 0) {
      res.status(400).json({ message: "You have already liked this post." });
      return;
    }

    const likeId = uuidv4();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Insert like into the database
      const insertLikeQuery = `
        INSERT INTO post_likes (id, user_id, post_id)
        VALUES ($1, $2, $3);
      `;
      await client.query(insertLikeQuery, [likeId, userId, postId]);

      // Increment likes_count on the post
      const updateLikesCountQuery = `
        UPDATE posts
        SET likes_count = likes_count + 1
        WHERE id = $1;
      `;
      await client.query(updateLikesCountQuery, [postId]);

      await client.query("COMMIT");
      res.status(201).json({ message: "Post liked successfully." });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Error during like transaction:", err);
      res.status(500).json({ message: "Internal server error." });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Error liking post:", err);
    res.status(500).json({ message: "Internal server error." });
  }
};

export const unlikePost = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.userId;
  const { id: postId } = req.params;

  try {
    // Check if the user has liked the post
    const likeExistsQuery = `
      SELECT id
      FROM post_likes
      WHERE user_id = $1 AND post_id = $2;
    `;
    const likeExistsResult = await pool.query(likeExistsQuery, [
      userId,
      postId,
    ]);

    if (likeExistsResult.rowCount === 0) {
      res.status(400).json({ message: "You have not liked this post." });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Delete the like
      const deleteLikeQuery = `
        DELETE FROM post_likes
        WHERE user_id = $1 AND post_id = $2;
      `;
      await client.query(deleteLikeQuery, [userId, postId]);

      // Decrement likes_count on the post
      const updateLikesCountQuery = `
        UPDATE posts
        SET likes_count = GREATEST(likes_count - 1, 0)
        WHERE id = $1;
      `;
      await client.query(updateLikesCountQuery, [postId]);

      await client.query("COMMIT");
      res.status(200).json({ message: "Post unliked successfully." });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Error during unlike transaction:", err);
      res.status(500).json({ message: "Internal server error." });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Error unliking post:", err);
    res.status(500).json({ message: "Internal server error." });
  }
};

export const bookmarkPost = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.userId;
  const { id: postId } = req.params;

  try {
    // Validate the post exists
    const postQuery = `
      SELECT id
      FROM posts
      WHERE id = $1;
    `;
    const postResult = await pool.query(postQuery, [postId]);

    if (postResult.rowCount === 0) {
      res.status(404).json({ message: "Post not found." });
      return;
    }

    // Check if the user already bookmarked the post
    const bookmarkExistsQuery = `
      SELECT id
      FROM post_bookmarks
      WHERE user_id = $1 AND post_id = $2;
    `;
    const bookmarkExistsResult = await pool.query(bookmarkExistsQuery, [
      userId,
      postId,
    ]);

    if (bookmarkExistsResult.rowCount && bookmarkExistsResult.rowCount > 0) {
      res
        .status(400)
        .json({ message: "You have already bookmarked this post." });
      return;
    }

    const bookmarkId = uuidv4();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Insert bookmark into the database
      const insertBookmarkQuery = `
        INSERT INTO post_bookmarks (id, user_id, post_id)
        VALUES ($1, $2, $3);
      `;
      await client.query(insertBookmarkQuery, [bookmarkId, userId, postId]);

      // Increment bookmarks_count on the post
      const updateBookmarksCountQuery = `
        UPDATE posts
        SET bookmarks_count = bookmarks_count + 1
        WHERE id = $1;
      `;
      await client.query(updateBookmarksCountQuery, [postId]);

      await client.query("COMMIT");
      res.status(201).json({ message: "Post bookmarked successfully." });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Error during bookmark transaction:", err);
      res.status(500).json({ message: "Internal server error." });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Error bookmarking post:", err);
    res.status(500).json({ message: "Internal server error." });
  }
};

export const unbookmarkPost = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.userId;
  const { id: postId } = req.params;

  try {
    // Check if the user has bookmarked the post
    const bookmarkExistsQuery = `
      SELECT id
      FROM post_bookmarks
      WHERE user_id = $1 AND post_id = $2;
    `;
    const bookmarkExistsResult = await pool.query(bookmarkExistsQuery, [
      userId,
      postId,
    ]);

    if (bookmarkExistsResult.rowCount === 0) {
      res.status(400).json({ message: "You have not bookmarked this post." });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Delete the bookmark
      const deleteBookmarkQuery = `
        DELETE FROM post_bookmarks
        WHERE user_id = $1 AND post_id = $2;
      `;
      await client.query(deleteBookmarkQuery, [userId, postId]);

      // Decrement bookmarks_count on the post
      const updateBookmarksCountQuery = `
        UPDATE posts
        SET bookmarks_count = GREATEST(bookmarks_count - 1, 0)
        WHERE id = $1;
      `;
      await client.query(updateBookmarksCountQuery, [postId]);

      await client.query("COMMIT");
      res.status(200).json({ message: "Post unbookmarked successfully." });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Error during unbookmark transaction:", err);
      res.status(500).json({ message: "Internal server error." });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Error unbookmarking post:", err);
    res.status(500).json({ message: "Internal server error." });
  }
};

// Repost or Quote a Post
export const repostOrQuote = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.userId; // Extracted from JWT middleware
  const { originalPostId, type, content } = req.body;

  if (!originalPostId) {
    res.status(400).json({ message: "Original post ID is required." });
    return;
  }

  try {
    // Validate the original post exists
    const originalPostQuery = `
      SELECT id, type
      FROM posts
      WHERE id = $1;
    `;
    const originalPostResult = await pool.query(originalPostQuery, [
      originalPostId,
    ]);

    if (originalPostResult.rowCount === 0) {
      res.status(404).json({ message: "Original post not found." });
      return;
    }

    const originalPost = originalPostResult.rows[0];

    // Validate the repost or quote type
    if (!type || !["personal", originalPost.type].includes(type)) {
      res.status(400).json({
        message:
          "Invalid type. Type must match the original post or be 'personal' for quotes.",
      });
      return;
    }

    // Generate a new UUID for the repost/quote
    const postId = uuidv4();

    // Start a transaction for atomicity
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Insert the repost/quote into the `posts` table
      const insertPostQuery = `
        INSERT INTO posts (id, user_id, original_post_id, type)
        VALUES ($1, $2, $3, $4)
        RETURNING *;
      `;
      const postResult = await client.query(insertPostQuery, [
        postId,
        userId,
        originalPostId,
        type,
      ]);

      if (postResult.rowCount === 0) {
        throw new Error("Failed to create repost/quote in posts table.");
      }

      // Increment `shares_count` for the original post
      const incrementSharesQuery = `
        UPDATE posts
        SET shares_count = shares_count + 1
        WHERE id = $1;
      `;
      await client.query(incrementSharesQuery, [originalPostId]);

      // If it's a quote, insert content into `posts_personal`
      if (type === "personal") {
        if (!content || content.trim() === "") {
          res
            .status(400)
            .json({ message: "Content is required for a quote post." });
          return;
        }
        const insertPersonalQuery = `
          INSERT INTO posts_personal (post_id, content)
          VALUES ($1, $2)
          RETURNING *;
        `;
        const personalResult = await client.query(insertPersonalQuery, [
          postId,
          content,
        ]);

        if (personalResult.rowCount === 0) {
          throw new Error("Failed to create personal content for the quote.");
        }

        res.status(201).json({
          post: postResult.rows[0],
          additionalData: personalResult.rows[0],
        });
      } else {
        res.status(201).json({ post: postResult.rows[0] });
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Error during repost/quote transaction:", err);
      res.status(500).json({ message: "Internal server error." });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Error handling repost/quote:", err);
    res.status(500).json({ message: "Internal server error." });
  }
};
