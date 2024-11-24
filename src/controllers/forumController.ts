import { Request, Response } from "express";
import pool from "../db";
import { deleteFile, uploadFile } from "../utils/supabaseStorage";
import { SupabaseClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";

export const createForum = async (
  req: Request,
  res: Response
): Promise<void> => {
  const client = req.supabase as SupabaseClient; // Supabase client from the request

  const { name, description, is_coi } = req.body;
  const creatorId = req.userId;

  const avatarFile = (req.files as { avatar?: Express.Multer.File[] })
    ?.avatar?.[0];
  const coverFile = (req.files as { cover?: Express.Multer.File[] })
    ?.cover?.[0];

  if (!creatorId || !name) {
    res.status(400).json({ message: "creatorId and name are required" });
    return;
  }

  // Check if the user is an admin
  const isAdminQuery = `
  SELECT 1 
    FROM users_admin 
  WHERE user_id = $1`;
  const isAdminResult = await pool.query(isAdminQuery, [creatorId]);
  const isAdmin = isAdminResult?.rowCount && isAdminResult.rowCount > 0;

  if (!is_coi && !isAdmin) {
    res
      .status(403)
      .json({ message: "Only admins are allowed to create Bidang forums." });
    return;
  }

  try {
    const bucketName = "forum-media"; // Dynamic bucket name passed to the upload utility
    const forumId = uuidv4(); // Generate a unique ID for the forum before uploading files

    let avatarUrl: string | null = null;
    let coverUrl: string | null = null;

    // Upload avatar file
    if (avatarFile) {
      const avatarPath = `forums/${forumId}/avatar/${Date.now()}_${
        avatarFile.originalname
      }`;
      avatarUrl = await uploadFile(
        client,
        bucketName,
        avatarFile.buffer,
        avatarPath
      );
    }

    // Upload cover file
    if (coverFile) {
      const coverPath = `forums/${forumId}/cover/${Date.now()}_${
        coverFile.originalname
      }`;
      coverUrl = await uploadFile(
        client,
        bucketName,
        coverFile.buffer,
        coverPath
      );
    }

    // Insert forum into the database
    const query = `
      INSERT INTO forums (
        id, creator_id, name, description, avatar_url, cover_url, is_coi
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, name, description, avatar_url, cover_url, is_coi, created_at, updated_at;
    `;
    const values = [
      forumId,
      creatorId,
      name,
      description,
      avatarUrl,
      coverUrl,
      is_coi,
    ];

    const result = await pool.query(query, values);
    const forum = result.rows[0];

    // Add the creator to forum_members with the 'core' role
    const insertMemberQuery = `
      INSERT INTO forum_members (forum_id, user_id, role, is_approved, approved_at, joined_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    `;
    const memberValues = [forumId, creatorId, "core", true];
    await pool.query(insertMemberQuery, memberValues);

    res.status(201).json(forum);
  } catch (err) {
    console.error("Error creating forum:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const followForum = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { forumId } = req.params;
  const userId = req.userId;

  if (!userId || !forumId) {
    res.status(400).json({ message: "User ID and Forum ID are required" });
    return;
  }

  try {
    // Check if the user has already requested to join or is a member
    const checkQuery = `
      SELECT is_approved
      FROM forum_members
      WHERE forum_id = $1 AND user_id = $2;
    `;

    const checkResult = await pool.query(checkQuery, [forumId, userId]);

    if (checkResult.rows.length > 0) {
      const { is_approved } = checkResult.rows[0];

      if (!is_approved) {
        res.status(400).json({
          message:
            "You have already requested to join this forum. Please wait for approval.",
        });
        return;
      }

      res
        .status(400)
        .json({ message: "You are already a member of this forum." });
      return;
    }

    // Add the user to forum_members
    const query = `
      INSERT INTO forum_members (
        forum_id, user_id, role, is_approved, joined_at
      ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      RETURNING forum_id, user_id, is_core, is_approved, joined_at;
    `;

    const values = [forumId, userId, "core", false];
    const result = await pool.query(query, values);

    res.status(201).json({
      message: "User requested to join forum",
      member: result.rows[0],
    });
  } catch (err) {
    console.error("Error following/joining forum:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const approveJoinRequest = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { forumId } = req.params;
  const { userIdToApprove } = req.body;
  const userId = req.userId;

  if (!forumId || !userId || !userIdToApprove) {
    res.status(400).json({
      message: "Forum ID, user ID, and user ID to approve are required",
    });
    return;
  }

  try {
    // Check if the requesting user is a core member of the forum
    const coreCheckQuery = `
      SELECT is_core
      FROM forum_members
      WHERE forum_id = $1 AND user_id = $2;
    `;
    const coreCheckResult = await pool.query(coreCheckQuery, [forumId, userId]);

    if (coreCheckResult.rows.length === 0 || !coreCheckResult.rows[0].is_core) {
      res
        .status(403)
        .json({ message: "Only core members can approve join requests." });
      return;
    }

    // Check if the user to approve has a pending join request
    const pendingCheckQuery = `
      SELECT is_approved
      FROM forum_members
      WHERE forum_id = $1 AND user_id = $2;
    `;
    const pendingCheckResult = await pool.query(pendingCheckQuery, [
      forumId,
      userIdToApprove,
    ]);

    if (pendingCheckResult.rows.length === 0) {
      res.status(404).json({ message: "No join request found for this user." });
      return;
    }

    if (pendingCheckResult.rows[0].is_approved) {
      res
        .status(400)
        .json({ message: "This user is already a member of the forum." });
      return;
    }

    // Approve the join request
    const approveQuery = `
      UPDATE forum_members
      SET is_approved = true, approved_at = CURRENT_TIMESTAMP
      WHERE forum_id = $1 AND user_id = $2
      RETURNING forum_id, user_id, is_approved, approved_at;
    `;

    const approveResult = await pool.query(approveQuery, [
      forumId,
      userIdToApprove,
    ]);

    res.status(200).json({
      message: "Join request approved successfully.",
      member: approveResult.rows[0],
    });
  } catch (err) {
    console.error("Error approving join request:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getForumById = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;

  if (!id) {
    res.status(400).json({ message: "Forum ID is required" });
    return;
  }

  try {
    const query = `
      SELECT id, creator_id, name, description, avatar_url, cover_url, is_coi, created_at, updated_at
      FROM forums
      WHERE id = $1;
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      res.status(404).json({ message: "Forum not found" });
      return;
    }

    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error("Error fetching forum:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const editForum = async (req: Request, res: Response): Promise<void> => {
  const client = req.supabase as SupabaseClient; // Supabase client from the request
  const { id } = req.params;
  const { name, description, is_coi } = req.body;
  const avatarFile = (req.files as { avatar?: Express.Multer.File[] })
    ?.avatar?.[0];
  const coverFile = (req.files as { cover?: Express.Multer.File[] })
    ?.cover?.[0];

  const bucketName = "forum-media"; // Bucket name is passed dynamically

  if (!id) {
    res.status(400).json({ message: "Forum ID is required" });
    return;
  }

  try {
    // Fetch the current forum details to identify existing avatar and cover
    const fetchQuery = `SELECT avatar_url, cover_url FROM forums WHERE id = $1`;
    const fetchResult = await pool.query(fetchQuery, [id]);

    if (fetchResult.rows.length === 0) {
      res.status(404).json({ message: "Forum not found" });
      return;
    }

    const existingForum = fetchResult.rows[0];
    let avatarUrl = existingForum.avatar_url;
    let coverUrl = existingForum.cover_url;

    // Upload new avatar file and delete old one if present
    if (avatarFile) {
      if (avatarUrl) {
        await deleteFile(client, bucketName, avatarUrl); // Pass bucketName dynamically
      }
      const avatarPath = `forums/${id}/avatar/${Date.now()}_${
        avatarFile.originalname
      }`;
      avatarUrl = await uploadFile(
        client,
        bucketName,
        avatarFile.buffer,
        avatarPath
      );
    }

    // Upload new cover file and delete old one if present
    if (coverFile) {
      if (coverUrl) {
        await deleteFile(client, bucketName, coverUrl); // Pass bucketName dynamically
      }
      const coverPath = `forums/${id}/cover/${Date.now()}_${
        coverFile.originalname
      }`;
      coverUrl = await uploadFile(
        client,
        bucketName,
        coverFile.buffer,
        coverPath
      );
    }

    // Update the forum with new values
    const updateQuery = `
      UPDATE forums
      SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        avatar_url = COALESCE($3, avatar_url),
        cover_url = COALESCE($4, cover_url),
        is_coi = COALESCE($5, is_coi),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING id, name, description, avatar_url, cover_url, is_coi, created_at, updated_at;
    `;

    const values = [name, description, avatarUrl, coverUrl, is_coi, id];
    const result = await pool.query(updateQuery, values);

    if (result.rows.length === 0) {
      res.status(404).json({ message: "Forum not found" });
      return;
    }

    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error("Error updating forum:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const deleteForum = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;

  if (!id) {
    res.status(400).json({ message: "Forum ID is required" });
    return;
  }

  try {
    const query = `
      DELETE FROM forums
      WHERE id = $1
      RETURNING id;
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      res.status(404).json({ message: "Forum not found" });
      return;
    }

    res
      .status(200)
      .json({ message: "Forum deleted successfully", id: result.rows[0].id });
  } catch (err) {
    console.error("Error deleting forum:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};
