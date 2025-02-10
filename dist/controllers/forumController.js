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
exports.deleteForum = exports.editForum = exports.getForumById = exports.getJoinedForums = exports.getAllForums = exports.approveJoinRequest = exports.unfollowForum = exports.followForum = exports.createForum = void 0;
const db_1 = __importDefault(require("../db"));
const supabaseStorage_1 = require("../utils/supabaseStorage");
const uuid_1 = require("uuid");
const createForum = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    const client = req.supabase; // Supabase client from the request
    const { name, description, is_coi } = req.body;
    const creatorId = req.userId;
    const avatarFile = (_b = (_a = req.files) === null || _a === void 0 ? void 0 : _a.avatar) === null || _b === void 0 ? void 0 : _b[0];
    const coverFile = (_d = (_c = req.files) === null || _c === void 0 ? void 0 : _c.cover) === null || _d === void 0 ? void 0 : _d[0];
    if (!creatorId || !name) {
        res.status(400).json({ message: "creatorId and name are required" });
        return;
    }
    // Check if the user is an admin
    const isAdminQuery = `
  SELECT 1 
    FROM users_admin 
  WHERE user_id = $1`;
    const isAdminResult = yield db_1.default.query(isAdminQuery, [creatorId]);
    const isAdmin = (isAdminResult === null || isAdminResult === void 0 ? void 0 : isAdminResult.rowCount) && isAdminResult.rowCount > 0;
    if (!is_coi && !isAdmin) {
        res
            .status(403)
            .json({ message: "Only admins are allowed to create Bidang forums." });
        return;
    }
    const dbClient = yield db_1.default.connect();
    try {
        // Start transaction
        yield dbClient.query("BEGIN");
        const bucketName = "forum-media"; // Dynamic bucket name passed to the upload utility
        const forumId = (0, uuid_1.v4)(); // Generate a unique ID for the forum before uploading files
        let avatarUrl = null;
        let coverUrl = null;
        // Upload avatar file
        if (avatarFile) {
            const avatarPath = `forums/${forumId}/avatar/${Date.now()}_${avatarFile.originalname}`;
            avatarUrl = yield (0, supabaseStorage_1.uploadFile)(client, bucketName, avatarFile.buffer, avatarPath);
        }
        // Upload cover file
        if (coverFile) {
            const coverPath = `forums/${forumId}/cover/${Date.now()}_${coverFile.originalname}`;
            coverUrl = yield (0, supabaseStorage_1.uploadFile)(client, bucketName, coverFile.buffer, coverPath);
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
        const forumResult = yield dbClient.query(forumInsertQuery, forumValues);
        const forum = forumResult.rows[0];
        // Add the creator to forum_members with the 'core' role
        const memberId = (0, uuid_1.v4)();
        const insertMemberQuery = `
      INSERT INTO forum_members (id, forum_id, user_id, role, is_approved, approved_at, joined_at)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    `;
        const memberValues = [memberId, forumId, creatorId, "core", true];
        yield dbClient.query(insertMemberQuery, memberValues);
        // Increment members_count in the forums table
        const incrementMembersQuery = `
      UPDATE forums
      SET members_count = members_count + 1
      WHERE id = $1;
    `;
        yield dbClient.query(incrementMembersQuery, [forumId]);
        // Commit transaction
        yield dbClient.query("COMMIT");
        res.status(201).json(forum);
    }
    catch (err) {
        // Rollback transaction in case of an error
        yield dbClient.query("ROLLBACK");
        console.error("Error creating forum:", err);
        res.status(500).json({ message: "Internal server error" });
    }
    finally {
        dbClient.release();
    }
});
exports.createForum = createForum;
const followForum = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { forumId } = req.params;
    const userId = req.userId;
    const id = (0, uuid_1.v4)();
    if (!userId || !forumId) {
        res.status(400).json({ message: "User ID and Forum ID are required" });
        return;
    }
    // Get a client from the pool to start a transaction.
    const client = yield db_1.default.connect();
    try {
        yield client.query("BEGIN");
        // Check if the user is already in forum_members.
        const checkQuery = `
      SELECT is_approved
      FROM forum_members
      WHERE forum_id = $1 AND user_id = $2;
    `;
        const checkResult = yield client.query(checkQuery, [forumId, userId]);
        if (checkResult.rows.length > 0) {
            const { is_approved } = checkResult.rows[0];
            if (is_approved) {
                yield client.query("ROLLBACK");
                res
                    .status(400)
                    .json({ message: "You are already a member of this forum." });
                return;
            }
            else {
                yield client.query("ROLLBACK");
                res.status(400).json({
                    message: "You have already requested to join this forum. Please wait for approval.",
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
        const insertResult = yield client.query(insertQuery, values);
        // Increment the members_count in the forums table.
        const incrementMembersQuery = `
      UPDATE forums
      SET members_count = members_count + 1
      WHERE id = $1;
    `;
        yield client.query(incrementMembersQuery, [forumId]);
        // Commit the transaction.
        yield client.query("COMMIT");
        res.status(201).json({
            message: "User successfully joined the forum.",
            member: insertResult.rows[0],
        });
    }
    catch (error) {
        yield client.query("ROLLBACK");
        console.error("Error following/joining forum:", error);
        res.status(500).json({ message: "Internal server error" });
    }
    finally {
        client.release();
    }
});
exports.followForum = followForum;
const unfollowForum = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { forumId } = req.params;
    const userId = req.userId;
    if (!userId || !forumId) {
        res.status(400).json({ message: "User ID and Forum ID are required" });
        return;
    }
    // Acquire a client from the pool to use a transaction.
    const client = yield db_1.default.connect();
    try {
        yield client.query("BEGIN");
        // Check if the user is currently a member of the forum.
        const checkQuery = `
      SELECT *
      FROM forum_members
      WHERE forum_id = $1 AND user_id = $2;
    `;
        const checkResult = yield client.query(checkQuery, [forumId, userId]);
        if (checkResult.rows.length === 0) {
            yield client.query("ROLLBACK");
            res.status(400).json({ message: "You are not a member of this forum." });
            return;
        }
        // Remove the user's membership record.
        const deleteQuery = `
      DELETE FROM forum_members
      WHERE forum_id = $1 AND user_id = $2;
    `;
        yield client.query(deleteQuery, [forumId, userId]);
        // Decrement the forum's member count.
        const decrementMembersQuery = `
      UPDATE forums
      SET members_count = members_count - 1
      WHERE id = $1;
    `;
        yield client.query(decrementMembersQuery, [forumId]);
        // Commit the transaction.
        yield client.query("COMMIT");
        res.status(200).json({
            message: "User successfully unfollowed the forum.",
        });
    }
    catch (error) {
        yield client.query("ROLLBACK");
        console.error("Error unfollowing forum:", error);
        res.status(500).json({ message: "Internal server error" });
    }
    finally {
        client.release();
    }
});
exports.unfollowForum = unfollowForum;
const approveJoinRequest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
        const coreCheckResult = yield db_1.default.query(coreCheckQuery, [forumId, userId]);
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
        const pendingCheckResult = yield db_1.default.query(pendingCheckQuery, [
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
        const approveResult = yield db_1.default.query(approveQuery, [
            forumId,
            userIdToApprove,
        ]);
        res.status(200).json({
            message: "Join request approved successfully.",
            member: approveResult.rows[0],
        });
    }
    catch (err) {
        console.error("Error approving join request:", err);
        res.status(500).json({ message: "Internal server error" });
    }
});
exports.approveJoinRequest = approveJoinRequest;
const getAllForums = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { page = 1, limit = 10, isCoi } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    try {
        // Validate `isCoi` query param
        const validIsCoi = isCoi === "true" || isCoi === "false" || isCoi === undefined;
        if (!validIsCoi) {
            res
                .status(400)
                .json({ message: "'isCoi' must be 'true' or 'false' if provided." });
            return;
        }
        // Build filter for `isCoi`
        const filters = isCoi ? `WHERE f.is_coi = $1` : "";
        const values = isCoi
            ? [isCoi === "true", parseInt(limit), offset]
            : [parseInt(limit), offset];
        // Query for total count of forums
        const totalCountQuery = `
      SELECT COUNT(*) AS total
      FROM forums f
      ${filters};
    `;
        const totalCountResult = yield db_1.default.query(totalCountQuery, isCoi ? [isCoi === "true"] : []);
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
        const forumsResult = yield db_1.default.query(forumsQuery, values);
        res.status(200).json({
            forums: forumsResult.rows,
            totalData,
            page: parseInt(page),
            limit: parseInt(limit),
        });
    }
    catch (err) {
        console.error("Error fetching forums:", err);
        res.status(500).json({ message: "Internal server error" });
    }
});
exports.getAllForums = getAllForums;
const getJoinedForums = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { page = 1, limit = 10, isCoi, role } = req.query;
    const userId = req.userId; // Extracted from middleware
    const offset = (parseInt(page) - 1) * parseInt(limit);
    try {
        // Validate 'isCoi' query parameter
        const validIsCoi = isCoi === "true" || isCoi === "false" || isCoi === undefined;
        if (!validIsCoi) {
            res
                .status(400)
                .json({ message: "'isCoi' must be 'true' or 'false' if provided." });
            return;
        }
        // Build filters dynamically
        const filters = [`fm.user_id = $1`]; // Always filter by user_id
        const values = [userId];
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
        const totalCountResult = yield db_1.default.query(totalCountQuery, values);
        const totalData = parseInt(totalCountResult.rows[0].total, 10);
        // Add pagination values
        values.push(parseInt(limit));
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
        const forumsResult = yield db_1.default.query(forumsQuery, values);
        res.status(200).json({
            forums: forumsResult.rows,
            totalData,
            page: parseInt(page),
            limit: parseInt(limit),
        });
    }
    catch (err) {
        console.error("Error fetching joined forums:", err);
        res.status(500).json({ message: "Internal server error" });
    }
});
exports.getJoinedForums = getJoinedForums;
const getForumById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
        const result = yield db_1.default.query(query, [loggedInUserId, id]);
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
    }
    catch (err) {
        console.error("Error fetching forum:", err);
        res.status(500).json({ message: "Internal server error" });
    }
});
exports.getForumById = getForumById;
const editForum = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    const client = req.supabase; // Supabase client from the request
    const { id } = req.params;
    const { name, description, is_coi } = req.body;
    const avatarFile = (_b = (_a = req.files) === null || _a === void 0 ? void 0 : _a.avatar) === null || _b === void 0 ? void 0 : _b[0];
    const coverFile = (_d = (_c = req.files) === null || _c === void 0 ? void 0 : _c.cover) === null || _d === void 0 ? void 0 : _d[0];
    const bucketName = "forum-media"; // Bucket name is passed dynamically
    if (!id) {
        res.status(400).json({ message: "Forum ID is required" });
        return;
    }
    try {
        // Fetch the current forum details to identify existing avatar and cover
        const fetchQuery = `SELECT avatar_url, cover_url FROM forums WHERE id = $1`;
        const fetchResult = yield db_1.default.query(fetchQuery, [id]);
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
                yield (0, supabaseStorage_1.deleteFile)(client, bucketName, avatarUrl); // Pass bucketName dynamically
            }
            const avatarPath = `forums/${id}/avatar/${Date.now()}_${avatarFile.originalname}`;
            avatarUrl = yield (0, supabaseStorage_1.uploadFile)(client, bucketName, avatarFile.buffer, avatarPath);
        }
        // Upload new cover file and delete old one if present
        if (coverFile) {
            if (coverUrl) {
                yield (0, supabaseStorage_1.deleteFile)(client, bucketName, coverUrl); // Pass bucketName dynamically
            }
            const coverPath = `forums/${id}/cover/${Date.now()}_${coverFile.originalname}`;
            coverUrl = yield (0, supabaseStorage_1.uploadFile)(client, bucketName, coverFile.buffer, coverPath);
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
        const result = yield db_1.default.query(updateQuery, values);
        if (result.rows.length === 0) {
            res.status(404).json({ message: "Forum not found" });
            return;
        }
        res.status(200).json(result.rows[0]);
    }
    catch (err) {
        console.error("Error updating forum:", err);
        res.status(500).json({ message: "Internal server error" });
    }
});
exports.editForum = editForum;
const deleteForum = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
        const result = yield db_1.default.query(query, [id]);
        if (result.rows.length === 0) {
            res.status(404).json({ message: "Forum not found" });
            return;
        }
        res
            .status(200)
            .json({ message: "Forum deleted successfully", id: result.rows[0].id });
    }
    catch (err) {
        console.error("Error deleting forum:", err);
        res.status(500).json({ message: "Internal server error" });
    }
});
exports.deleteForum = deleteForum;
