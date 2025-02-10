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
exports.toggleAdminStatus = exports.getRegistrantById = exports.getFollowing = exports.getFollowers = exports.unfollowUser = exports.followUser = exports.updateProfile = exports.getUserById = exports.getAllUsers = exports.acceptAsMember = exports.registerAsMember = void 0;
const db_1 = __importDefault(require("../db"));
const userModel_1 = require("../models/userModel");
const supabaseClient_1 = require("../utils/supabaseClient");
const supabaseStorage_1 = require("../utils/supabaseStorage");
const uuid_1 = require("uuid");
const registerAsMember = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const client = req.supabase; // Supabase client from the request
    const { birthPlace, birthDate, zone, latestEducation, address, nik, phone, referral, } = req.body;
    const userId = req.userId;
    const idCardFile = (_b = (_a = req.files) === null || _a === void 0 ? void 0 : _a.id_card) === null || _b === void 0 ? void 0 : _b[0];
    try {
        const bucketName = "user-media"; // Dynamic bucket name passed to the upload utility
        let idCardUrl = null;
        // Upload ID Card file
        if (idCardFile) {
            const avatarPath = `user/${userId}/id-card/${Date.now()}_${idCardFile.originalname}`;
            idCardUrl = yield (0, supabaseStorage_1.uploadFile)(client, bucketName, idCardFile.buffer, avatarPath);
        }
        const registration = yield (0, userModel_1.createRegistration)(userId, idCardUrl || "", birthPlace, birthDate, zone, latestEducation, address, nik, phone, referral);
        res.status(201).json(registration);
    }
    catch (err) {
        console.log(err);
        res.status(500).json({ message: "Server error" });
    }
});
exports.registerAsMember = registerAsMember;
const acceptAsMember = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id: registrantId } = req.params; // ID of the registrant
    const userId = req.userId;
    // Check if the user is an admin
    const isAdminQuery = `
  SELECT 1 
  FROM users_admin 
  WHERE user_id = $1
`;
    const isAdminResult = yield db_1.default.query(isAdminQuery, [userId]);
    const isAdmin = (isAdminResult === null || isAdminResult === void 0 ? void 0 : isAdminResult.rowCount) && isAdminResult.rowCount > 0;
    if (!isAdmin) {
        res
            .status(403)
            .json({ message: "You are not authorized to access this resource." });
        return;
    }
    try {
        // Step 1: Retrieve the registrant by ID
        const registrantQuery = `
      SELECT 
        ur.user_id,
        ur.id_number,
        ur.birth_place,
        ur.birth_date,
        ur.zone,
        ur.latest_education,
        ur.address,
        ur.nik,
        ur.phone_number,
        ur.referral
      FROM users_registration ur
      WHERE ur.user_id = $1
    `;
        const registrantResult = yield db_1.default.query(registrantQuery, [registrantId]);
        if (registrantResult.rowCount === 0) {
            res.status(404).json({ message: "Registrant not found." });
            return;
        }
        const registrant = registrantResult.rows[0];
        console.log(registrant);
        // Step 2: Promote the registrant to a member
        const promotedMember = yield (0, userModel_1.promoteToMember)(registrant.user_id, registrant.id_number, registrant.birth_place, registrant.birth_date, registrant.zone, registrant.latest_education, registrant.address, registrant.nik, registrant.phone_number, registrant.referral);
        // Step 3: Respond with the result
        res.status(201).json(promotedMember);
    }
    catch (err) {
        console.error("Error promoting registrant to member:", err);
        res.status(500).json({ message: "Server error" });
    }
});
exports.acceptAsMember = acceptAsMember;
const getAllUsers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { page = 1, size = 10, status } = req.query; // Pagination and filter params
    try {
        // Pagination logic
        const offset = (Number(page) - 1) * Number(size);
        const limit = Number(size);
        // Query logic based on status filter
        let finalQuery = "";
        let countQuery = "";
        if (status === "member") {
            // Member query logic
            finalQuery = `
        SELECT 
          u.id AS user_id,
          u.email,
          u.username,
          u.display_name,
          u.bio,
          u.avatar_url,
          u.cover_url,
          u.is_verified,
          u.is_private,
          um.id_number,
          um.birth_place,
          um.birth_date,
          um.zone,
          um.latest_education,
          um.address,
          um.nik,
          um.phone_number,
          um.referral,
          um.position,
          CASE 
            WHEN ua.user_id IS NOT NULL THEN true 
            ELSE false 
          END AS is_admin,
          u.created_at,
          u.updated_at,
          um.status
        FROM users u
        INNER JOIN users_member um ON u.id = um.user_id
        LEFT JOIN users_admin ua ON u.id = ua.user_id
        ORDER BY u.created_at DESC
        LIMIT $1 OFFSET $2
      `;
            countQuery = `
        SELECT COUNT(*) AS total
        FROM users u
        INNER JOIN users_member um ON u.id = um.user_id
      `;
        }
        else if (status === "registrant") {
            // Registrant query logic
            finalQuery = `
        SELECT 
          u.id AS user_id,
          u.email,
          u.username,
          u.display_name,
          u.bio,
          u.avatar_url,
          u.cover_url,
          u.is_verified,
          u.is_private,
          ur.id_number,
          ur.birth_place,
          ur.birth_date,
          ur.zone,
          ur.latest_education,
          ur.address,
          ur.nik,
          ur.phone_number,
          ur.referral,
          CASE 
            WHEN ua.user_id IS NOT NULL THEN true 
            ELSE false 
          END AS is_admin,
          u.created_at,
          u.updated_at,
          ur.status
        FROM users u
        INNER JOIN users_registration ur ON u.id = ur.user_id
        LEFT JOIN users_admin ua ON u.id = ua.user_id
        ORDER BY u.created_at DESC
        LIMIT $1 OFFSET $2
      `;
            countQuery = `
        SELECT COUNT(*) AS total
        FROM users u
        INNER JOIN users_registration ur ON u.id = ur.user_id
      `;
        }
        else {
            // Invalid status filter
            res.status(400).json({ message: "Invalid status filter." });
            return;
        }
        // Execute paginated query and count query
        const usersResult = yield db_1.default.query(finalQuery, [limit, offset]);
        const countResult = yield db_1.default.query(countQuery);
        // Fetch additional metrics
        const metricsQuery = `
      SELECT 
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS "totalActive",
        SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) AS "totalInactive",
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS "totalRejected",
        SUM(CASE WHEN zone = 'DPD' THEN 1 ELSE 0 END) AS "totalDpd",
        SUM(CASE WHEN zone = 'DPW' THEN 1 ELSE 0 END) AS "totalDpw",
        SUM(CASE WHEN zone = 'DPP' THEN 1 ELSE 0 END) AS "totalDpp"
      FROM ${status === "member" ? "users_member" : "users_registration"}
    `;
        const metricsResult = yield db_1.default.query(metricsQuery);
        // Combine metrics with totalData
        const metrics = Object.assign({ totalData: parseInt(countResult.rows[0].total, 10) }, metricsResult.rows[0]);
        const total = metrics.totalData; // Total data count
        const totalPages = Math.ceil(total / limit);
        res.status(200).json({
            data: usersResult.rows,
            totalData: total,
            totalPages,
            page: Number(page),
            pageSize: limit,
            metrics, // Include all metrics in the response
        });
    }
    catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({ message: "Internal server error." });
    }
});
exports.getAllUsers = getAllUsers;
const getUserById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userId = req.userId; // Extracted from JWT in middleware
    const { id } = req.params; // The target user ID to fetch
    try {
        // Check if the user is an admin
        // const isAdminQuery = `
        //   SELECT 1
        //   FROM users_admin
        //   WHERE user_id = $1
        // `;
        // const isAdminResult = await pool.query(isAdminQuery, [userId]);
        // const isAdmin = isAdminResult?.rowCount && isAdminResult.rowCount > 0;
        // Allow access if the user is fetching their own details or is an admin
        // if (userId !== id && !isAdmin) {
        //   res.status(403).json({
        //     message: "You are not authorized to access this user's details.",
        //   });
        //   return;
        // }
        // Query to get the user details, joined data, and follow status
        const userWithDetailsQuery = `
      SELECT 
        u.id, 
        u.email, 
        u.username, 
        u.display_name, 
        u.bio, 
        u.avatar_url, 
        u.cover_url, 
        u.is_verified, 
        u.is_private,
        CASE 
          WHEN ua.user_id IS NOT NULL THEN true 
          ELSE false 
        END AS is_admin,
        u.created_at, 
        u.updated_at,
        ua.is_admin,
        um.id_number,
        um.address,
        um.birth_date,
        um.zone,
        um.latest_education,
        -- Check if the authenticated user follows the target user
        CASE
          WHEN uf.follower_id IS NOT NULL THEN true
          ELSE false
        END AS is_following
      FROM users u
      LEFT JOIN users_admin ua ON u.id = ua.user_id
      LEFT JOIN users_member um ON u.id = um.user_id
      LEFT JOIN user_follows uf
        ON uf.follower_id = $1 AND uf.following_id = u.id
      WHERE u.id = $2;
    `;
        const userWithDetailsResult = yield db_1.default.query(userWithDetailsQuery, [
            userId,
            id,
        ]);
        if (userWithDetailsResult.rowCount === 0) {
            res.status(404).json({ message: "User not found." });
            return;
        }
        res.status(200).json(userWithDetailsResult.rows[0]);
    }
    catch (error) {
        console.error("Error fetching user by ID:", error);
        res.status(500).json({ message: "Internal server error." });
    }
});
exports.getUserById = getUserById;
const updateProfile = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    const client = req.supabase;
    const userId = req.userId; // Extracted from JWT in middleware
    const { id } = req.params; // The target user ID to update
    const updateFields = req.body; // JSON body with the fields to update
    // Extract uploaded files
    const avatarFile = (_b = (_a = req.files) === null || _a === void 0 ? void 0 : _a.avatar) === null || _b === void 0 ? void 0 : _b[0];
    const coverFile = (_d = (_c = req.files) === null || _c === void 0 ? void 0 : _c.cover) === null || _d === void 0 ? void 0 : _d[0];
    try {
        // Check if the logged-in user is an admin
        const isAdminQuery = `
      SELECT 1 
      FROM users_admin 
      WHERE user_id = $1
    `;
        const isAdminResult = yield db_1.default.query(isAdminQuery, [userId]);
        const isAdmin = (isAdminResult === null || isAdminResult === void 0 ? void 0 : isAdminResult.rowCount) && isAdminResult.rowCount > 0;
        // Ensure only the logged-in user or admin can edit the profile
        if (userId !== id && !isAdmin) {
            res
                .status(403)
                .json({ message: "You are not authorized to update this profile." });
            return;
        }
        // Fetch the current profile to delete existing files if new ones are uploaded
        const currentProfileQuery = `SELECT avatar_url, cover_url FROM users WHERE id = $1`;
        const currentProfileResult = yield db_1.default.query(currentProfileQuery, [id]);
        const currentProfile = currentProfileResult.rows[0];
        let avatarUrl = currentProfile === null || currentProfile === void 0 ? void 0 : currentProfile.avatar_url;
        let coverUrl = currentProfile === null || currentProfile === void 0 ? void 0 : currentProfile.cover_url;
        // Upload new avatar and delete the old one
        if (avatarFile) {
            if (avatarUrl) {
                yield (0, supabaseStorage_1.deleteFile)(client, "user-media", avatarUrl); // Delete existing file
            }
            const avatarPath = `user/${id}/avatar/${Date.now()}_${avatarFile.originalname}`;
            avatarUrl = yield (0, supabaseStorage_1.uploadFile)(client, "user-media", avatarFile.buffer, avatarPath);
        }
        // Upload new cover and delete the old one
        if (coverFile) {
            if (coverUrl) {
                yield (0, supabaseStorage_1.deleteFile)(client, "user-media", coverUrl); // Delete existing file
            }
            const coverPath = `user/${id}/cover/${Date.now()}_${coverFile.originalname}`;
            coverUrl = yield (0, supabaseStorage_1.uploadFile)(client, "user-media", coverFile.buffer, coverPath);
        }
        // Add avatar_url and cover_url to updateFields
        if (avatarUrl)
            updateFields.avatar_url = avatarUrl;
        if (coverUrl)
            updateFields.cover_url = coverUrl;
        // Dynamically build the update query based on provided fields
        const fields = Object.keys(updateFields).filter((key) => key !== "userId");
        if (fields.length === 0) {
            res.status(400).json({ message: "No fields provided for update." });
            return;
        }
        const setClause = fields
            .map((field, index) => `${field} = $${index + 2}`)
            .join(", ");
        const values = fields.map((field) => updateFields[field]);
        // Update the user's profile in the `users` table
        const updateQuery = `
      UPDATE users 
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $1 
      RETURNING *;
    `;
        const updateResult = yield db_1.default.query(updateQuery, [id, ...values]);
        if (updateResult.rowCount === 0) {
            res.status(404).json({ message: "User not found." });
            return;
        }
        const updatedUser = updateResult.rows[0];
        // If `is_verified` is in the update fields, update `auth.users` to set email_confirmed_at
        if (updateFields.is_verified === true) {
            const email = updatedUser.email;
            const confirmEmailQuery = `
        UPDATE auth.users 
        SET email_confirmed_at = now() 
        WHERE email = $1
      `;
            yield db_1.default.query(confirmEmailQuery, [email]);
        }
        // Sync changes with Supabase Auth for specific fields (email, phone, etc.)
        const authUpdateFields = {};
        if (updateFields.email)
            authUpdateFields.email = updateFields.email;
        if (updateFields.phone)
            authUpdateFields.phone = updateFields.phone;
        if (Object.keys(authUpdateFields).length > 0) {
            const { data: authUser, error: authError } = yield supabaseClient_1.supabaseAdmin.auth.admin.updateUserById(id, authUpdateFields);
            if (authError) {
                console.error("Error updating Supabase Auth user:", authError.message);
                res.status(500).json({ message: "Error syncing with Supabase Auth." });
                return;
            }
            // console.log("Supabase Auth user updated:", authUser);
        }
        // Fetch the updated user data with joined tables
        const userWithDetailsQuery = `
      SELECT 
        u.id, 
        u.email, 
        u.username, 
        u.display_name, 
        u.bio, 
        u.avatar_url, 
        u.cover_url, 
        u.is_verified, 
        u.is_private,
        u.created_at, 
        u.updated_at,
        ua.is_admin,
        um.id_number,
        um.address,
        um.birth_date,
        um.zone,
        um.latest_education
      FROM users u
      LEFT JOIN users_admin ua ON u.id = ua.user_id
      LEFT JOIN users_member um ON u.id = um.user_id
      WHERE u.id = $1;
    `;
        const userWithDetailsResult = yield db_1.default.query(userWithDetailsQuery, [id]);
        if (userWithDetailsResult.rowCount === 0) {
            res.status(404).json({ message: "User not found after update." });
            return;
        }
        res.status(200).json(userWithDetailsResult.rows[0]);
    }
    catch (error) {
        console.error("Error updating profile:", error);
        res.status(500).json({ message: "Internal server error." });
    }
});
exports.updateProfile = updateProfile;
const followUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userId = req.userId; // Extracted from JWT in middleware
    const { followingId } = req.params; // The user to follow
    try {
        if (userId === followingId) {
            res.status(400).json({ message: "You cannot follow yourself." });
            return;
        }
        // Check if the follow relationship already exists
        const checkFollowQuery = `
      SELECT 1
      FROM user_follows
      WHERE follower_id = $1 AND following_id = $2
    `;
        const checkFollowResult = yield db_1.default.query(checkFollowQuery, [
            userId,
            followingId,
        ]);
        if (checkFollowResult.rowCount && checkFollowResult.rowCount > 0) {
            res.status(400).json({ message: "You are already following this user." });
            return;
        }
        const userFollowsId = (0, uuid_1.v4)();
        // Insert the follow relationship
        const followQuery = `
      INSERT INTO user_follows (id, follower_id, following_id, created_at)
      VALUES ($1, $2, $3, NOW())
      RETURNING *;
    `;
        const followResult = yield db_1.default.query(followQuery, [
            userFollowsId,
            userId,
            followingId,
        ]);
        res.status(201).json({
            message: "Followed successfully.",
            data: followResult.rows[0],
        });
    }
    catch (error) {
        console.error("Error following user:", error);
        res.status(500).json({ message: "Internal server error." });
    }
});
exports.followUser = followUser;
const unfollowUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userId = req.userId; // Extracted from JWT in middleware
    const { followingId } = req.params; // The user to unfollow
    try {
        // Delete the follow relationship
        const unfollowQuery = `
      DELETE FROM user_follows
      WHERE follower_id = $1 AND following_id = $2
      RETURNING *;
    `;
        const unfollowResult = yield db_1.default.query(unfollowQuery, [
            userId,
            followingId,
        ]);
        if (unfollowResult.rowCount === 0) {
            res.status(404).json({ message: "You are not following this user." });
            return;
        }
        res.status(200).json({ message: "Unfollowed successfully." });
    }
    catch (error) {
        console.error("Error unfollowing user:", error);
        res.status(500).json({ message: "Internal server error." });
    }
});
exports.unfollowUser = unfollowUser;
const getFollowers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userId = req.userId; // Extracted from JWT in middleware
    const { id } = req.params; // User ID whose followers are being retrieved
    const { page = 1, limit = 10 } = req.query; // Pagination parameters
    try {
        const offset = (Number(page) - 1) * Number(limit);
        const actualLimit = Number(limit);
        const followersQuery = `
      SELECT 
        u.id AS user_id,
        u.username,
        u.display_name,
        u.avatar_url,
        uf.created_at AS followed_at,
        -- Check if the authenticated user is following this user
        CASE
          WHEN uf2.follower_id IS NOT NULL THEN true
          ELSE false
        END AS is_following
      FROM user_follows uf
      INNER JOIN users u ON uf.follower_id = u.id
      -- Check if the authenticated user follows the follower
      LEFT JOIN user_follows uf2 ON uf2.follower_id = $1 AND uf2.following_id = u.id
      WHERE uf.following_id = $2
      ORDER BY uf.created_at DESC
      LIMIT $3 OFFSET $4;
    `;
        const followersResult = yield db_1.default.query(followersQuery, [
            userId,
            id,
            actualLimit,
            offset,
        ]);
        const countQuery = `
      SELECT COUNT(*) AS total
      FROM user_follows
      WHERE following_id = $1;
    `;
        const countResult = yield db_1.default.query(countQuery, [id]);
        const total = parseInt(countResult.rows[0].total, 10);
        const totalPages = Math.ceil(total / actualLimit);
        res.status(200).json({
            followers: followersResult.rows,
            totalData: total,
            totalPages,
            currentPage: Number(page),
            pageSize: limit,
        });
    }
    catch (error) {
        console.error("Error fetching followers:", error);
        res.status(500).json({ message: "Internal server error." });
    }
});
exports.getFollowers = getFollowers;
const getFollowing = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userId = req.userId; // Extracted from JWT in middleware
    const { id } = req.params; // User ID whose following list is being retrieved
    const { page = 1, limit = 10 } = req.query; // Pagination parameters
    try {
        const offset = (Number(page) - 1) * Number(limit);
        const actualLimit = Number(limit);
        const followingQuery = `
      SELECT 
        u.id AS user_id,
        u.username,
        u.display_name,
        u.avatar_url,
        uf.created_at AS followed_at,
        -- Check if the authenticated user is following this user
        CASE
          WHEN uf2.follower_id IS NOT NULL THEN true
          ELSE false
        END AS is_following
      FROM user_follows uf
      INNER JOIN users u ON uf.following_id = u.id
      -- Check if the authenticated user follows the user being followed
      LEFT JOIN user_follows uf2 ON uf2.follower_id = $1 AND uf2.following_id = u.id
      WHERE uf.follower_id = $2
      ORDER BY uf.created_at DESC
      LIMIT $3 OFFSET $4;
    `;
        const followingResult = yield db_1.default.query(followingQuery, [
            userId,
            id,
            actualLimit,
            offset,
        ]);
        const countQuery = `
      SELECT COUNT(*) AS total
      FROM user_follows
      WHERE follower_id = $1;
    `;
        const countResult = yield db_1.default.query(countQuery, [id]);
        const total = parseInt(countResult.rows[0].total, 10);
        const totalPages = Math.ceil(total / actualLimit);
        res.status(200).json({
            following: followingResult.rows,
            totalData: total,
            totalPages,
            currentPage: Number(page),
            pageSize: actualLimit,
        });
    }
    catch (error) {
        console.error("Error fetching following:", error);
        res.status(500).json({ message: "Internal server error." });
    }
});
exports.getFollowing = getFollowing;
const getRegistrantById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userId = req.userId; // Extracted from JWT in middleware
    const { id } = req.params; // Registrant ID to fetch
    try {
        // Check if the user is an admin
        const isAdminQuery = `
      SELECT 1 
      FROM users_admin 
      WHERE user_id = $1
    `;
        const isAdminResult = yield db_1.default.query(isAdminQuery, [userId]);
        const isAdmin = (isAdminResult === null || isAdminResult === void 0 ? void 0 : isAdminResult.rowCount) && isAdminResult.rowCount > 0;
        if (!isAdmin) {
            res
                .status(403)
                .json({ message: "You are not authorized to access this resource." });
            return;
        }
        // Query to get the registrant by ID
        const query = `
      SELECT 
        u.id AS user_id,
        u.email,
        u.username,
        u.display_name,
        u.bio,
        u.avatar_url,
        u.cover_url,
        u.is_verified,
        u.is_private,
        ur.id_number,
        CASE 
          WHEN ua.user_id IS NOT NULL THEN true 
          ELSE false 
        END AS is_admin,
        ur.birth_place,
        ur.birth_date,
        ur.zone,
        ur.latest_education,
        ur.address,
        ur.nik,
        ur.phone_number,
        ur.referral,
        ur.status,
        ur.created_at AS registration_created_at,
        u.updated_at AS registration_updated_at
      FROM users u
      LEFT JOIN users_admin ua ON u.id = ua.user_id
      RIGHT JOIN users_registration ur ON u.id = ur.user_id
      WHERE ur.user_id = $1
    `;
        const result = yield db_1.default.query(query, [id]);
        if (result.rowCount === 0) {
            res.status(404).json({ message: "Registrant not found." });
            return;
        }
        res.status(200).json(result.rows[0]);
    }
    catch (error) {
        console.error("Error fetching registrant by ID:", error);
        res.status(500).json({ message: "Internal server error." });
    }
});
exports.getRegistrantById = getRegistrantById;
const toggleAdminStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id: passedUserId } = req.params; // Extract userId from request parameters
    const userId = req.userId;
    try {
        // Check if the user is an admin
        const isAdminQuery = `
      SELECT 1 
      FROM users_admin 
      WHERE user_id = $1
      `;
        const isAdminResult = yield db_1.default.query(isAdminQuery, [userId]);
        const isAdmin = (isAdminResult === null || isAdminResult === void 0 ? void 0 : isAdminResult.rowCount) && isAdminResult.rowCount > 0;
        if (!isAdmin) {
            res
                .status(403)
                .json({ message: "You are not authorized to access this resource." });
            return;
        }
        // Check if the user is already an admin
        const checkAdminQuery = `
      SELECT 1 
      FROM users_admin 
      WHERE user_id = $1
    `;
        const adminResult = yield db_1.default.query(checkAdminQuery, [passedUserId]);
        if (adminResult.rowCount && adminResult.rowCount > 0) {
            // User is already an admin, remove them from the users_admin table
            const deleteAdminQuery = `
        DELETE FROM users_admin 
        WHERE user_id = $1
      `;
            yield db_1.default.query(deleteAdminQuery, [passedUserId]);
            res.status(200).json({ message: "Admin status removed successfully." });
        }
        else {
            // User is not an admin, insert them into the users_admin table
            const insertAdminQuery = `
        INSERT INTO users_admin (user_id) 
        VALUES ($1)
      `;
            yield db_1.default.query(insertAdminQuery, [passedUserId]);
            res.status(200).json({ message: "Admin status granted successfully." });
        }
    }
    catch (error) {
        console.error("Error toggling admin status:", error);
        res.status(500).json({ message: "Internal server error." });
    }
});
exports.toggleAdminStatus = toggleAdminStatus;
