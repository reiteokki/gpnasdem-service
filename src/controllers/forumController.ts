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

  const dbClient = await pool.connect();

  try {
    // Start transaction
    await dbClient.query("BEGIN");

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
    const forumInsertQuery = `
      INSERT INTO forums (
        id, creator_id, name, description, avatar_url, cover_url, is_coi
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, name, description, avatar_url, cover_url, is_coi, created_at, updated_at;
    `;
    const forumValues = [
      forumId,
      creatorId,
      name,
      description,
      avatarUrl,
      coverUrl,
      is_coi,
    ];

    const forumResult = await dbClient.query(forumInsertQuery, forumValues);
    const forum = forumResult.rows[0];

    // Add the creator to forum_members with the 'core' role
    const memberId = uuidv4();
    const insertMemberQuery = `
      INSERT INTO forum_members (id, forum_id, user_id, role, is_approved, approved_at, joined_at)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    `;
    const memberValues = [memberId, forumId, creatorId, "core", true];
    await dbClient.query(insertMemberQuery, memberValues);

    // Increment members_count in the forums table
    const incrementMembersQuery = `
      UPDATE forums
      SET members_count = members_count + 1
      WHERE id = $1;
    `;
    await dbClient.query(incrementMembersQuery, [forumId]);

    // Commit transaction
    await dbClient.query("COMMIT");

    res.status(201).json(forum);
  } catch (err) {
    // Rollback transaction in case of an error
    await dbClient.query("ROLLBACK");
    console.error("Error creating forum:", err);
    res.status(500).json({ message: "Internal server error" });
  } finally {
    dbClient.release();
  }
};

export const followForum = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { forumId } = req.params;
  const userId = req.userId;

  const id = uuidv4();

  if (!userId || !forumId) {
    res.status(400).json({ message: "User ID and Forum ID are required" });
    return;
  }

  // Get a client from the pool to start a transaction.
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Check if the user is already in forum_members.
    const checkQuery = `
      SELECT is_approved
      FROM forum_members
      WHERE forum_id = $1 AND user_id = $2;
    `;
    const checkResult = await client.query(checkQuery, [forumId, userId]);

    if (checkResult.rows.length > 0) {
      const { is_approved } = checkResult.rows[0];

      if (is_approved) {
        await client.query("ROLLBACK");
        res
          .status(400)
          .json({ message: "You are already a member of this forum." });
        return;
      } else {
        await client.query("ROLLBACK");
        res.status(400).json({
          message:
            "You have already requested to join this forum. Please wait for approval.",
        });
        return;
      }
    }

    // Insert a new row into forum_members with automatic approval.
    const insertQuery = `
      INSERT INTO forum_members (
        id, forum_id, user_id, role, is_approved, joined_at, approved_at
      ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING forum_id, user_id, role, is_approved, joined_at, approved_at;
    `;
    const values = [id, forumId, userId, "member", true];
    const insertResult = await client.query(insertQuery, values);

    // Increment the members_count in the forums table.
    const incrementMembersQuery = `
      UPDATE forums
      SET members_count = members_count + 1
      WHERE id = $1;
    `;
    await client.query(incrementMembersQuery, [forumId]);

    // Commit the transaction.
    await client.query("COMMIT");

    res.status(201).json({
      message: "User successfully joined the forum.",
      member: insertResult.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error following/joining forum:", error);
    res.status(500).json({ message: "Internal server error" });
  } finally {
    client.release();
  }
};

export const unfollowForum = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { forumId } = req.params;
  const userId = req.userId;

  if (!userId || !forumId) {
    res.status(400).json({ message: "User ID and Forum ID are required" });
    return;
  }

  // Acquire a client from the pool to use a transaction.
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Check if the user is currently a member of the forum.
    const checkQuery = `
      SELECT *
      FROM forum_members
      WHERE forum_id = $1 AND user_id = $2;
    `;
    const checkResult = await client.query(checkQuery, [forumId, userId]);

    if (checkResult.rows.length === 0) {
      await client.query("ROLLBACK");
      res.status(400).json({ message: "You are not a member of this forum." });
      return;
    }

    // Remove the user's membership record.
    const deleteQuery = `
      DELETE FROM forum_members
      WHERE forum_id = $1 AND user_id = $2;
    `;
    await client.query(deleteQuery, [forumId, userId]);

    // Decrement the forum's member count.
    const decrementMembersQuery = `
      UPDATE forums
      SET members_count = members_count - 1
      WHERE id = $1;
    `;
    await client.query(decrementMembersQuery, [forumId]);

    // Commit the transaction.
    await client.query("COMMIT");

    res.status(200).json({
      message: "User successfully unfollowed the forum.",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error unfollowing forum:", error);
    res.status(500).json({ message: "Internal server error" });
  } finally {
    client.release();
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

export const getAllForums = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { page = 1, limit = 10, isCoi } = req.query;

  const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

  try {
    // Validate `isCoi` query param
    const validIsCoi =
      isCoi === "true" || isCoi === "false" || isCoi === undefined;
    if (!validIsCoi) {
      res
        .status(400)
        .json({ message: "'isCoi' must be 'true' or 'false' if provided." });
      return;
    }

    // Build filter for `isCoi`
    const filters = isCoi ? `WHERE f.is_coi = $1` : "";
    const values = isCoi
      ? [isCoi === "true", parseInt(limit as string), offset]
      : [parseInt(limit as string), offset];

    // Query for total count of forums
    const totalCountQuery = `
      SELECT COUNT(*) AS total
      FROM forums f
      ${filters};
    `;
    const totalCountResult = await pool.query(
      totalCountQuery,
      isCoi ? [isCoi === "true"] : []
    );
    const totalData = parseInt(totalCountResult.rows[0].total, 10);

    // Query for paginated forums with members count
    const forumsQuery = `
      SELECT 
        f.id, 
        f.name, 
        f.description, 
        f.avatar_url, 
        f.cover_url, 
        f.is_coi, 
        f.created_at, 
        f.updated_at,
        COALESCE(members_count.members_count, 0) AS members_count
      FROM forums f
      LEFT JOIN (
        SELECT forum_id, COUNT(user_id) AS members_count
        FROM forum_members
        GROUP BY forum_id
      ) AS members_count ON members_count.forum_id = f.id
      ${filters}
      ORDER BY f.created_at DESC
      LIMIT $${isCoi ? 2 : 1} OFFSET $${isCoi ? 3 : 2};
    `;
    const forumsResult = await pool.query(forumsQuery, values);

    res.status(200).json({
      forums: forumsResult.rows,
      totalData,
      page: parseInt(page as string),
      limit: parseInt(limit as string),
    });
  } catch (err) {
    console.error("Error fetching forums:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getJoinedForums = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { page = 1, limit = 10, isCoi, role } = req.query;

  const userId = req.userId; // Extracted from middleware
  const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

  try {
    // Validate 'isCoi' query parameter
    const validIsCoi =
      isCoi === "true" || isCoi === "false" || isCoi === undefined;
    if (!validIsCoi) {
      res
        .status(400)
        .json({ message: "'isCoi' must be 'true' or 'false' if provided." });
      return;
    }

    // Build filters dynamically
    const filters = [`fm.user_id = $1`]; // Always filter by user_id
    const values: any[] = [userId];

    if (isCoi !== undefined) {
      filters.push(`f.is_coi = $${values.length + 1}`);
      values.push(isCoi === "true");
    }

    if (role) {
      // Include role filter if `role` is provided
      filters.push(`fm.role = $${values.length + 1}`);
      values.push(role);
    }

    const whereClause = filters.join(" AND ");

    // Get total count of forums
    const totalCountQuery = `
      SELECT COUNT(*) AS total
      FROM forums f
      INNER JOIN forum_members fm ON fm.forum_id = f.id
      WHERE ${whereClause};
    `;
    const totalCountResult = await pool.query(totalCountQuery, values);
    const totalData = parseInt(totalCountResult.rows[0].total, 10);

    // Add pagination values
    values.push(parseInt(limit as string));
    values.push(offset);

    // Get forums
    const forumsQuery = `
      SELECT 
        f.id, 
        f.name, 
        f.description, 
        f.avatar_url, 
        f.cover_url, 
        f.is_coi, 
        f.created_at, 
        f.updated_at,
        COUNT(fm.user_id) AS members_count
      FROM forums f
      INNER JOIN forum_members fm ON fm.forum_id = f.id
      WHERE ${whereClause}
      GROUP BY f.id
      ORDER BY f.created_at DESC
      LIMIT $${values.length - 1} OFFSET $${values.length};
    `;
    const forumsResult = await pool.query(forumsQuery, values);

    res.status(200).json({
      forums: forumsResult.rows,
      totalData,
      page: parseInt(page as string),
      limit: parseInt(limit as string),
    });
  } catch (err) {
    console.error("Error fetching joined forums:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getForumById = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  const loggedInUserId = req.userId; // Assuming the logged-in user ID is available in the request

  if (!id) {
    res.status(400).json({ message: "Forum ID is required" });
    return;
  }

  try {
    // Query to fetch the forum details, and check if the logged-in user is a core member or following the forum
    const query = `
      SELECT 
        f.id, f.creator_id, f.name, f.description, f.avatar_url, f.cover_url, 
        f.is_coi, f.created_at, f.updated_at,
        -- Check if the logged-in user is a core member
        CASE 
          WHEN fm.role = 'core' THEN TRUE
          ELSE FALSE
        END AS is_core_member,
        -- Check if the logged-in user is following the forum (regardless of role)
        CASE
          WHEN fm.user_id IS NOT NULL THEN TRUE
          ELSE FALSE
        END AS is_following,
        -- Get the followers count
        (SELECT COUNT(*) FROM forum_members WHERE forum_id = f.id) AS followers_count
      FROM forums f
      LEFT JOIN forum_members fm ON f.id = fm.forum_id AND fm.user_id = $1
      WHERE f.id = $2;
    `;

    const result = await pool.query(query, [loggedInUserId, id]);

    if (result.rows.length === 0) {
      res.status(404).json({ message: "Forum not found" });
      return;
    }

    // Return forum details along with additional information
    const forum = result.rows[0];
    res.status(200).json({
      id: forum.id,
      creator_id: forum.creator_id,
      name: forum.name,
      description: forum.description,
      avatar_url: forum.avatar_url,
      cover_url: forum.cover_url,
      is_coi: forum.is_coi,
      created_at: forum.created_at,
      updated_at: forum.updated_at,
      is_core_member: forum.is_core_member,
      is_following: forum.is_following,
      followers_count: forum.followers_count,
    });
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
