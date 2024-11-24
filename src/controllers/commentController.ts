import { Request, Response } from "express";
import pool from "../db";
import { v4 as uuidv4 } from "uuid";

export const createComment = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { postId, parentCommentId, content } = req.body;
  const creatorId = req.userId;

  // Check if the post exists
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

  if (!creatorId || content?.trim() === "") {
    res
      .status(400)
      .json({ message: "creatorId and comment content are required" });
    return;
  }

  const commentId = uuidv4(); // Generate a unique ID for the comment

  try {
    // Start a transaction for atomicity
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Insert the new comment into the database
      const insertCommentQuery = `
        INSERT INTO comments (
          id, user_id, post_id, parent_comment_id, content, created_at
        ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
        RETURNING id, user_id, post_id, parent_comment_id, content, created_at;
      `;
      const commentValues = [
        commentId,
        creatorId,
        postId,
        parentCommentId || null,
        content,
      ];
      const commentResult = await client.query(
        insertCommentQuery,
        commentValues
      );

      // Increment `comments_count` for the post
      const updatePostCommentsQuery = `
        UPDATE posts
        SET comments_count = comments_count + 1
        WHERE id = $1;
      `;
      await client.query(updatePostCommentsQuery, [postId]);

      // If the comment is a reply, increment `replies_count` for the parent comment
      if (parentCommentId) {
        const updateRepliesCountQuery = `
          UPDATE comments
          SET replies_count = replies_count + 1
          WHERE id = $1;
        `;
        await client.query(updateRepliesCountQuery, [parentCommentId]);
      }

      await client.query("COMMIT");
      res.status(201).json(commentResult.rows[0]);
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Error during comment creation transaction:", err);
      res.status(500).json({ message: "Internal server error." });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Error creating comment:", err);
    res.status(500).json({ message: "Internal server error." });
  }
};

export const getComments = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id: postId } = req.params;
  const { parentCommentId, page = 1, size = 10 } = req.query;

  // Ensure `postId` is provided
  if (!postId) {
    res.status(400).json({ message: "postId is required." });
    return;
  }

  const limit = parseInt(size as string, 10);
  const offset = (parseInt(page as string, 10) - 1) * limit;

  try {
    // Fetch comments for the given post and parentCommentId (or top-level comments)
    const query = `
      SELECT 
        c.id AS comment_id, 
        c.user_id, 
        c.post_id, 
        c.parent_comment_id, 
        c.content, 
        c.created_at, 
        u.username, 
        u.display_name
      FROM comments c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.post_id = $1 
        AND (c.parent_comment_id = $2 OR ($2 IS NULL AND c.parent_comment_id IS NULL))
      ORDER BY c.created_at ASC
      LIMIT $3 OFFSET $4;
    `;

    const values = [postId, parentCommentId || null, limit, offset];

    const result = await pool.query(query, values);

    // Total comments for pagination
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM comments
      WHERE post_id = $1
        AND (parent_comment_id = $2 OR ($2 IS NULL AND parent_comment_id IS NULL));
    `;
    const countResult = await pool.query(countQuery, [
      postId,
      parentCommentId || null,
    ]);
    const totalComments = parseInt(countResult.rows[0].total, 10);

    res.status(200).json({
      comments: result.rows,
      totalComments,
      page: parseInt(page as string, 10),
      size: limit,
    });
  } catch (err) {
    console.error("Error fetching comments:", err);
    res.status(500).json({ message: "Internal server error." });
  }
};

export const deleteComment = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.userId; // Extracted from JWT middleware
  const { id: commentId } = req.params; // Comment ID from request params

  try {
    // Fetch the comment to ensure it exists and belongs to the user
    const commentQuery = `
      SELECT id, user_id, post_id, parent_comment_id
      FROM comments
      WHERE id = $1;
    `;
    const commentResult = await pool.query(commentQuery, [commentId]);

    if (commentResult.rowCount === 0) {
      res.status(404).json({ message: "Comment not found." });
      return;
    }

    const comment = commentResult.rows[0];

    // Ensure only the comment owner can delete the comment
    if (comment.user_id !== userId) {
      res
        .status(403)
        .json({ message: "You are not authorized to delete this comment." });
      return;
    }

    const { post_id: postId } = comment;

    // Start a transaction to ensure atomicity
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Soft delete the comment by marking it as deleted
      const softDeleteQuery = `
        UPDATE comments
        SET is_deleted = TRUE, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1;
      `;
      await client.query(softDeleteQuery, [commentId]);

      // Update `comments_count` only for visible comments
      const updatePostQuery = `
        UPDATE posts
        SET comments_count = (
          SELECT COUNT(*) 
          FROM comments 
          WHERE post_id = $1 AND is_deleted = FALSE
        )
        WHERE id = $1;
      `;
      await client.query(updatePostQuery, [postId]);

      await client.query("COMMIT");

      res.status(200).json({ message: "Comment deleted successfully." });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Error during comment deletion transaction:", err);
      res.status(500).json({ message: "Internal server error." });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Error deleting comment:", err);
    res.status(500).json({ message: "Internal server error." });
  }
};

// Like a Comment
export const likeComment = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.userId;
  const { commentId } = req.params;

  try {
    const commentQuery = `
      SELECT user_id, is_deleted
      FROM comments
      WHERE id = $1;
    `;
    const commentResult = await pool.query(commentQuery, [commentId]);

    if (commentResult.rowCount === 0) {
      res.status(404).json({ message: "Comment not found." });
      return;
    }

    const comment = commentResult.rows[0];

    if (comment.is_deleted) {
      res.status(400).json({ message: "Cannot like a deleted comment." });
      return;
    }

    if (comment.user_id === userId) {
      res.status(400).json({ message: "You cannot like your own comment." });
      return;
    }

    const likeExistsQuery = `
      SELECT id
      FROM comment_likes
      WHERE user_id = $1 AND comment_id = $2;
    `;
    const likeExistsResult = await pool.query(likeExistsQuery, [
      userId,
      commentId,
    ]);

    if (likeExistsResult.rowCount && likeExistsResult.rowCount > 0) {
      res.status(400).json({ message: "You have already liked this comment." });
      return;
    }

    const likeId = uuidv4();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const insertLikeQuery = `
        INSERT INTO comment_likes (id, user_id, comment_id)
        VALUES ($1, $2, $3);
      `;
      await client.query(insertLikeQuery, [likeId, userId, commentId]);

      const updateLikesCountQuery = `
        UPDATE comments
        SET likes_count = likes_count + 1
        WHERE id = $1;
      `;
      await client.query(updateLikesCountQuery, [commentId]);

      await client.query("COMMIT");
      res.status(201).json({ message: "Comment liked successfully." });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Error during like transaction:", err);
      res.status(500).json({ message: "Internal server error." });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Error liking comment:", err);
    res.status(500).json({ message: "Internal server error." });
  }
};

// Unlike a Comment
export const unlikeComment = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.userId;
  const { commentId } = req.params;

  try {
    const likeExistsQuery = `
      SELECT id
      FROM comment_likes
      WHERE user_id = $1 AND comment_id = $2;
    `;
    const likeExistsResult = await pool.query(likeExistsQuery, [
      userId,
      commentId,
    ]);

    if (likeExistsResult.rowCount === 0) {
      res.status(400).json({ message: "You have not liked this comment." });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const deleteLikeQuery = `
        DELETE FROM comment_likes
        WHERE user_id = $1 AND comment_id = $2;
      `;
      await client.query(deleteLikeQuery, [userId, commentId]);

      const updateLikesCountQuery = `
        UPDATE comments
        SET likes_count = GREATEST(likes_count - 1, 0)
        WHERE id = $1;
      `;
      await client.query(updateLikesCountQuery, [commentId]);

      await client.query("COMMIT");
      res.status(200).json({ message: "Comment unliked successfully." });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Error during unlike transaction:", err);
      res.status(500).json({ message: "Internal server error." });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Error unliking comment:", err);
    res.status(500).json({ message: "Internal server error." });
  }
};

// Bookmark a Comment
export const bookmarkComment = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.userId;
  const { commentId } = req.params;

  try {
    const commentQuery = `
      SELECT user_id, is_deleted
      FROM comments
      WHERE id = $1;
    `;
    const commentResult = await pool.query(commentQuery, [commentId]);

    if (commentResult.rowCount === 0) {
      res.status(404).json({ message: "Comment not found." });
      return;
    }

    const comment = commentResult.rows[0];

    if (comment.is_deleted) {
      res.status(400).json({ message: "Cannot bookmark a deleted comment." });
      return;
    }

    if (comment.user_id === userId) {
      res
        .status(400)
        .json({ message: "You cannot bookmark your own comment." });
      return;
    }

    const bookmarkExistsQuery = `
      SELECT id
      FROM comment_bookmarks
      WHERE user_id = $1 AND comment_id = $2;
    `;
    const bookmarkExistsResult = await pool.query(bookmarkExistsQuery, [
      userId,
      commentId,
    ]);

    if (bookmarkExistsResult.rowCount && bookmarkExistsResult.rowCount > 0) {
      res
        .status(400)
        .json({ message: "You have already bookmarked this comment." });
      return;
    }

    const bookmarkId = uuidv4();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const insertBookmarkQuery = `
        INSERT INTO comment_bookmarks (id, user_id, comment_id)
        VALUES ($1, $2, $3);
      `;
      await client.query(insertBookmarkQuery, [bookmarkId, userId, commentId]);

      const updateBookmarksCountQuery = `
        UPDATE comments
        SET bookmarks_count = bookmarks_count + 1
        WHERE id = $1;
      `;
      await client.query(updateBookmarksCountQuery, [commentId]);

      await client.query("COMMIT");
      res.status(201).json({ message: "Comment bookmarked successfully." });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Error during bookmark transaction:", err);
      res.status(500).json({ message: "Internal server error." });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Error bookmarking comment:", err);
    res.status(500).json({ message: "Internal server error." });
  }
};

// Remove Bookmark from a Comment
export const unbookmarkComment = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.userId;
  const { commentId } = req.params;

  try {
    const bookmarkExistsQuery = `
      SELECT id
      FROM comment_bookmarks
      WHERE user_id = $1 AND comment_id = $2;
    `;
    const bookmarkExistsResult = await pool.query(bookmarkExistsQuery, [
      userId,
      commentId,
    ]);

    if (bookmarkExistsResult.rowCount === 0) {
      res
        .status(400)
        .json({ message: "You have not bookmarked this comment." });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const deleteBookmarkQuery = `
        DELETE FROM comment_bookmarks
        WHERE user_id = $1 AND comment_id = $2;
      `;
      await client.query(deleteBookmarkQuery, [userId, commentId]);

      const updateBookmarksCountQuery = `
        UPDATE comments
        SET bookmarks_count = GREATEST(bookmarks_count - 1, 0)
        WHERE id = $1;
      `;
      await client.query(updateBookmarksCountQuery, [commentId]);

      await client.query("COMMIT");
      res.status(200).json({ message: "Comment unbookmarked successfully." });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Error during unbookmark transaction:", err);
      res.status(500).json({ message: "Internal server error." });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Error unbookmarking comment:", err);
    res.status(500).json({ message: "Internal server error." });
  }
};
