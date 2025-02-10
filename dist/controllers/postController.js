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
exports.unrepostOrUnquote = exports.repostOrQuote = exports.unbookmarkPost = exports.bookmarkPost = exports.unlikePost = exports.likePost = exports.deletePost = exports.updatePost = exports.getPostById = exports.getPosts = exports.createPost = void 0;
const uuid_1 = require("uuid");
const db_1 = __importDefault(require("../db"));
const mediaController_1 = require("./mediaController");
const supabaseStorage_1 = require("../utils/supabaseStorage");
const createPost = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const userId = req.userId; // Extracted from JWT middleware
    const { forumId, type, content, title, startDateTime, endDateTime, isAnonymous, allowMultipleChoices, pollingOptions, } = req.body;
    const mediaFiles = (_a = req.files) === null || _a === void 0 ? void 0 : _a.media;
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
        const coreCheckResult = yield db_1.default.query(coreCheckQuery, [forumId, userId]);
        if (coreCheckResult.rows.length === 0 ||
            coreCheckResult.rows[0].role !== "core") {
            res
                .status(403)
                .json({ message: "Only core members can post in a forum." });
            return;
        }
    }
    const client = yield db_1.default.connect(); // Start a transaction by getting a client
    try {
        yield client.query("BEGIN"); // Start the transaction
        // Generate a new UUID for the post
        const postId = (0, uuid_1.v4)();
        // Insert the post into the `posts` table
        const insertPostQuery = `
      INSERT INTO posts (id, user_id, forum_id, type)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
        const postResult = yield client.query(insertPostQuery, [
            postId,
            userId,
            forumId || null,
            type,
        ]);
        if (postResult.rowCount === 0) {
            yield client.query("ROLLBACK"); // Rollback the transaction on failure
            res
                .status(500)
                .json({ message: "Failed to create post in posts table." });
            return;
        }
        // Handle post type-specific data
        let additionalData = {};
        switch (type) {
            case "personal":
                if (!content || content.trim() === "") {
                    yield client.query("ROLLBACK"); // Rollback the transaction on failure
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
                const personalResult = yield client.query(insertPersonalQuery, [
                    postId,
                    content,
                ]);
                if (personalResult.rowCount === 0) {
                    yield client.query("ROLLBACK"); // Rollback the transaction on failure
                    res.status(500).json({
                        message: "Failed to create personal post in posts_personal table.",
                    });
                    return;
                }
                additionalData = personalResult.rows[0];
                yield client.query("COMMIT");
                // Upload media files (if any)
                if (mediaFiles && mediaFiles.length > 0) {
                    const uploadedMedia = yield (0, mediaController_1.uploadPostMedia)(req.supabase, postId, mediaFiles);
                    additionalData.media = uploadedMedia;
                }
                break;
            case "article":
                if (!title || !content) {
                    yield client.query("ROLLBACK"); // Rollback the transaction on failure
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
                const articleResult = yield client.query(insertArticleQuery, [
                    postId,
                    title,
                    content,
                ]);
                if (articleResult.rowCount === 0) {
                    yield client.query("ROLLBACK"); // Rollback the transaction on failure
                    res.status(500).json({
                        message: "Failed to create article post in posts_article table.",
                    });
                    return;
                }
                additionalData = articleResult.rows[0];
                break;
            case "polling":
                if (!content ||
                    !startDateTime ||
                    !endDateTime ||
                    !pollingOptions ||
                    pollingOptions.length === 0) {
                    yield client.query("ROLLBACK"); // Rollback the transaction on failure
                    res.status(400).json({
                        message: "Question, start date, end date, and polling options are required for a polling post.",
                    });
                    return;
                }
                const insertPollingQuery = `
          INSERT INTO posts_polling (post_id, question, start_datetime, end_datetime, is_anonymous, allow_multiple_choices)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *;
        `;
                const pollingResult = yield client.query(insertPollingQuery, [
                    postId,
                    content,
                    startDateTime,
                    endDateTime,
                    isAnonymous || false,
                    allowMultipleChoices || false,
                ]);
                if (pollingResult.rowCount === 0) {
                    yield client.query("ROLLBACK"); // Rollback the transaction on failure
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
                    const optionId = (0, uuid_1.v4)();
                    const optionResult = yield client.query(insertOptionsQuery, [
                        optionId,
                        postId,
                        optionText,
                    ]);
                    if (optionResult.rowCount && optionResult.rowCount > 0) {
                        optionsData.push(optionResult.rows[0]);
                    }
                }
                if (optionsData.length === 0) {
                    yield client.query("ROLLBACK"); // Rollback the transaction on failure
                    res.status(500).json({
                        message: "Failed to create poll options in polling_options table.",
                    });
                    return;
                }
                additionalData = Object.assign(Object.assign({}, pollingResult.rows[0]), { options: optionsData });
                break;
            default:
                yield client.query("ROLLBACK"); // Rollback the transaction on failure
                res.status(400).json({ message: "Invalid post type." });
                return;
        }
        // Commit the transaction if all queries succeeded
        yield client.query("COMMIT");
        // Return the created post
        res.status(201).json({
            post: postResult.rows[0],
            additionalData,
        });
    }
    catch (error) {
        // Rollback the transaction if an error occurs
        yield client.query("ROLLBACK");
        console.error("Error creating post:", error);
        res.status(500).json({ message: "Internal server error." });
    }
    finally {
        client.release(); // Release the client back to the pool
    }
});
exports.createPost = createPost;
const getPosts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { type, forumId, userId: queryUserId, // Optional userId query parameter
    page = 1, limit = 10, lastCreatedAt, lastId, } = req.query;
    const loggedInUserId = req.userId; // Logged-in user's ID (for interaction checks like likes, comments, etc.)
    const userId = queryUserId || null; // Use provided userId if available, otherwise fallback to logged-in user
    const offset = (parseInt(page) - 1) * parseInt(limit);
    try {
        // Check if the forum_id exists (if provided)
        if (forumId) {
            const forumCheckQuery = `
        SELECT 1 FROM forums WHERE id = $1;
      `;
            const forumCheckResult = yield db_1.default.query(forumCheckQuery, [forumId]);
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
        AND ($2::UUID IS NULL OR p.forum_id = $2)
        AND ($3::UUID IS NULL OR p.user_id = $3);
    `;
        const totalCountResult = yield db_1.default.query(totalCountQuery, [
            type || null,
            forumId || null,
            userId || null, // Filter by userId if provided
        ]);
        const totalData = parseInt(totalCountResult.rows[0].total, 10);
        // Fetch paginated posts
        const postsQuery = `
      SELECT 
          p.id, p.original_post_id, p.user_id, p.forum_id, p.type, p.likes_count, 
          p.comments_count, p.shares_count, p.bookmarks_count, 
          p.created_at, p.updated_at,
          
          -- Current post author details
          u.display_name AS author_name, 
          u.avatar_url AS author_avatar,
          um.position AS author_position,

          -- Original post author details (if original_post_id exists)
          uo.display_name AS original_author_name,
          uo.avatar_url AS original_author_avatar,
          umo.user_id AS original_author_user_id,
          umo.position AS original_author_position,

          pp.content AS personal_content,
          po.title AS article_title, 
          po.content AS article_content,
          pol.question, pol.start_datetime, pol.end_datetime, pol.is_anonymous, pol.allow_multiple_choices,

          -- User interactions
          EXISTS (
            SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = $4
          ) AS has_liked,

          CASE
            WHEN EXISTS (
              SELECT 1 FROM posts p2 WHERE p2.original_post_id = p.id AND p2.user_id = $4
            ) THEN TRUE ELSE FALSE
          END AS has_shared,

          (
            SELECT p2.id
            FROM posts p2
            WHERE p2.original_post_id = p.id AND p2.user_id = $4
            LIMIT 1
          ) AS shared_post_id,

          (
            SELECT 
              CASE 
                WHEN pp2.content IS NOT NULL THEN 'quote'
                ELSE 'repost'
              END
            FROM posts p2
            LEFT JOIN posts_personal pp2 ON p2.id = pp2.post_id
            WHERE p2.original_post_id = p.id AND p2.user_id = $4
            LIMIT 1
          ) AS shared_type, -- 'quote' or 'repost' based on content presence

          EXISTS (
            SELECT 1 FROM comments c WHERE c.post_id = p.id AND c.user_id = $4
          ) AS has_commented,

          EXISTS (
            SELECT 1 FROM post_bookmarks pb WHERE pb.post_id = p.id AND pb.user_id = $4
          ) AS has_bookmarked

        FROM posts p
        LEFT JOIN posts_personal pp ON p.id = pp.post_id
        LEFT JOIN posts_article po ON p.id = po.post_id
        LEFT JOIN posts_polling pol ON p.id = pol.post_id
        LEFT JOIN users u ON p.user_id = u.id
        LEFT JOIN users_member um ON p.user_id = um.user_id

        -- Join for original post author details
        LEFT JOIN posts op ON p.original_post_id = op.id
        LEFT JOIN users uo ON op.user_id = uo.id
        LEFT JOIN users_member umo ON op.user_id = umo.user_id

        WHERE ($1::TEXT IS NULL OR p.type = $1)
          AND ($2::UUID IS NULL OR p.forum_id = $2)
          AND ($3::UUID IS NULL OR p.user_id = $3)  
          AND (($5::TIMESTAMP IS NULL AND $6::UUID IS NULL) OR (p.created_at, p.id) < ($5, $6))

        ORDER BY p.created_at DESC, p.id DESC
        LIMIT $7 OFFSET $8;
    `;
        const postsResult = yield db_1.default.query(postsQuery, [
            type || null, // Filter by type if provided
            forumId || null, // Filter by forum_id if provided
            userId || null, // Filter by user_id (either provided userId or logged-in userId)
            loggedInUserId || null, // Logged-in user ID for interaction checks
            lastCreatedAt || null, // For real-time pagination
            lastId || null, // For real-time pagination
            parseInt(limit), // Limit for pagination
            offset, // Offset for traditional pagination
        ]);
        const posts = postsResult.rows;
        // Fetch media for personal posts and options for polling posts
        const postIds = posts.map((post) => post.id);
        // Fetch media for personal posts
        const mediaQuery = `
      SELECT post_id, url
      FROM post_media
      WHERE post_id = ANY($1::UUID[]);
    `;
        const mediaResult = yield db_1.default.query(mediaQuery, [postIds]);
        const mediaMap = mediaResult.rows.reduce((acc, row) => {
            acc[row.post_id] = acc[row.post_id] || [];
            acc[row.post_id].push(row.url);
            return acc;
        }, {});
        // Fetch polling options for polling posts
        const pollingOptionsQuery = `
      SELECT polling_post_id, id AS option_id, text, votes_count
      FROM polling_options
      WHERE polling_post_id = ANY($1::UUID[]);
    `;
        const pollingOptionsResult = yield db_1.default.query(pollingOptionsQuery, [
            postIds,
        ]);
        const pollingOptionsMap = pollingOptionsResult.rows.reduce((acc, row) => {
            acc[row.polling_post_id] = acc[row.polling_post_id] || [];
            acc[row.polling_post_id].push({
                optionId: row.option_id,
                text: row.text,
                votesCount: row.votes_count,
            });
            return acc;
        }, {});
        // Add media and polling options to the respective posts
        const enrichedPosts = posts.map((post) => {
            if (post.type === "personal") {
                post.media = mediaMap[post.id] || [];
            }
            else if (post.type === "polling") {
                post.pollingOptions = pollingOptionsMap[post.id] || [];
            }
            return post;
        });
        res.status(200).json({
            posts: enrichedPosts,
            totalData, // Total number of posts matching the filters
            page: parseInt(page),
            limit: parseInt(limit),
        });
    }
    catch (err) {
        console.error("Error fetching posts:", err);
        res.status(500).json({ message: "Internal server error" });
    }
});
exports.getPosts = getPosts;
const getPostById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id: postId } = req.params; // Post ID from request params
    const userId = req.userId; // Extracted from JWT middleware
    if (!postId) {
        res.status(400).json({ message: "Post ID is required." });
        return;
    }
    try {
        // Fetch the main post details
        const postQuery = `
      SELECT 
        p.id, p.user_id, p.original_post_id, p.forum_id, p.type, p.likes_count, p.comments_count, 
        p.shares_count, p.bookmarks_count, p.created_at, p.updated_at,
        u.display_name AS author_name, u.avatar_url AS author_avatar, 
        f.name AS forum_name, f.avatar_url AS forum_avatar
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN forums f ON p.forum_id = f.id
      WHERE p.id = $1;
    `;
        const postResult = yield db_1.default.query(postQuery, [postId]);
        if (postResult.rowCount === 0) {
            res.status(404).json({ message: "Post not found." });
            return;
        }
        const post = postResult.rows[0];
        // Fetch type-specific details
        let additionalData = {};
        switch (post.type) {
            case "personal":
                // Fetch media for personal posts
                const mediaQuery = `
          SELECT url
          FROM post_media
          WHERE post_id = $1;
        `;
                const mediaResult = yield db_1.default.query(mediaQuery, [postId]);
                const media = mediaResult.rows.map((row) => row.url);
                // Fetch personal content
                const personalQuery = `
          SELECT content
          FROM posts_personal
          WHERE post_id = $1;
        `;
                const personalResult = yield db_1.default.query(personalQuery, [postId]);
                if (personalResult.rowCount && personalResult.rowCount > 0) {
                    additionalData = {
                        personal_content: personalResult.rows[0].content,
                        media,
                    };
                }
                break;
            case "article":
                // Fetch article-specific data
                const articleQuery = `
          SELECT title, content
          FROM posts_article
          WHERE post_id = $1;
        `;
                const articleResult = yield db_1.default.query(articleQuery, [postId]);
                if (articleResult.rowCount && articleResult.rowCount > 0) {
                    additionalData = {
                        article_title: articleResult.rows[0].title,
                        article_content: articleResult.rows[0].content,
                    };
                }
                break;
            case "polling":
                // Fetch polling-specific data
                const pollingQuery = `
          SELECT start_datetime, end_datetime, is_anonymous, allow_multiple_choices
          FROM posts_polling
          WHERE post_id = $1;
        `;
                const pollingResult = yield db_1.default.query(pollingQuery, [postId]);
                // Fetch polling options
                const pollingOptionsQuery = `
          SELECT id AS option_id, text, votes_count
          FROM polling_options
          WHERE polling_post_id = $1;
        `;
                const pollingOptionsResult = yield db_1.default.query(pollingOptionsQuery, [
                    postId,
                ]);
                const pollingOptions = pollingOptionsResult.rows.map((row) => ({
                    optionId: row.option_id,
                    text: row.text,
                    votesCount: row.votes_count,
                }));
                if (pollingResult.rowCount && pollingResult.rowCount > 0) {
                    additionalData = {
                        start_datetime: pollingResult.rows[0].start_datetime,
                        end_datetime: pollingResult.rows[0].end_datetime,
                        is_anonymous: pollingResult.rows[0].is_anonymous,
                        allow_multiple_choices: pollingResult.rows[0].allow_multiple_choices,
                        pollingOptions: pollingOptions,
                    };
                }
                break;
            default:
                res.status(400).json({ message: "Invalid post type." });
                return;
        }
        // Check if the user has liked, shared, or bookmarked the post
        const userInteractionsQuery = `
      SELECT 
      EXISTS(SELECT 1 FROM post_likes WHERE post_id = $1 AND user_id = $2) AS has_liked,
      EXISTS(SELECT 1 FROM post_bookmarks WHERE post_id = $1 AND user_id = $2) AS has_bookmarked,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM posts p2
          WHERE p2.original_post_id = $1
            AND p2.user_id = $2
        ) THEN TRUE
        ELSE FALSE
      END AS has_shared,
      (
        SELECT p2.id
        FROM posts p2
        WHERE p2.original_post_id = $1
          AND p2.user_id = $2
        LIMIT 1
      ) AS shared_post_id,
      (
        SELECT 
          CASE 
            WHEN pp2.content IS NOT NULL THEN 'quote'
            ELSE 'repost'
          END
        FROM posts p2
        LEFT JOIN posts_personal pp2 ON p2.id = pp2.post_id
        WHERE p2.original_post_id = $1
          AND p2.user_id = $2
        LIMIT 1
      ) AS shared_type
    `;
        const userInteractionsResult = yield db_1.default.query(userInteractionsQuery, [
            postId,
            userId,
        ]);
        const userInteractions = userInteractionsResult.rows[0];
        // Combine all data into a consistent format
        const postDetail = Object.assign(Object.assign(Object.assign({}, post), additionalData), userInteractions);
        // Respond with enriched post details
        res.status(200).json(postDetail);
    }
    catch (err) {
        console.error("Error fetching post details:", err);
        res.status(500).json({ message: "Internal server error" });
    }
});
exports.getPostById = getPostById;
const updatePost = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const client = req.supabase; // Supabase client from the request
    const userId = req.userId; // Extracted from JWT middleware
    const { id: postId } = req.params; // Post ID from request params
    const { content, title, previousMediaUrls } = req.body; // Data to update
    const mediaFiles = (_a = req.files) === null || _a === void 0 ? void 0 : _a.media;
    try {
        // Fetch the post to validate ownership and type
        const postQuery = `
      SELECT id, user_id, type
      FROM posts
      WHERE id = $1;
    `;
        const postResult = yield db_1.default.query(postQuery, [postId]);
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
        const isAdminResult = yield db_1.default.query(isAdminQuery, [userId]);
        const isAdmin = (isAdminResult === null || isAdminResult === void 0 ? void 0 : isAdminResult.rowCount) && isAdminResult.rowCount > 0;
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
        let additionalData = {};
        switch (post.type) {
            case "personal":
                if (content && content.trim() !== "") {
                    const updatePersonalQuery = `
            UPDATE posts_personal
            SET content = $1
            WHERE post_id = $2
            RETURNING *;
          `;
                    const personalResult = yield db_1.default.query(updatePersonalQuery, [
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
                if (!title ||
                    !content ||
                    title.trim() === "" ||
                    content.trim() === "") {
                    res.status(400).json({
                        message: "Title and content are required to update an article post.",
                    });
                    return;
                }
                const updateArticleQuery = `
          UPDATE posts_article
          SET title = $1, content = $2
          WHERE post_id = $3
          RETURNING *;
        `;
                const articleResult = yield db_1.default.query(updateArticleQuery, [
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
                yield (0, supabaseStorage_1.deleteFile)(client, "post-media", mediaUrl); // Delete from bucket
            }
            // Remove from `post_media` table
            const deleteMediaQuery = `
        DELETE FROM post_media
        WHERE post_id = $1 AND url = ANY($2::text[]);
      `;
            yield db_1.default.query(deleteMediaQuery, [postId, previousMediaUrls]);
        }
        // Upload new media files if `mediaFiles` are passed
        if (mediaFiles && mediaFiles.length > 0) {
            const uploadedMediaUrls = [];
            for (const file of mediaFiles) {
                const mediaPath = `posts/${postId}/media/${Date.now()}_${file.originalname}`;
                const uploadedUrl = yield (0, supabaseStorage_1.uploadFile)(client, "post-media", file.buffer, mediaPath);
                if (uploadedUrl) {
                    uploadedMediaUrls.push(uploadedUrl);
                }
            }
            // Insert new media URLs into `post_media` table
            const insertMediaQuery = `
        INSERT INTO post_media (post_id, url)
        VALUES ($1, unnest($2::text[]));
      `;
            yield db_1.default.query(insertMediaQuery, [postId, uploadedMediaUrls]);
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
        const updatedPostResult = yield db_1.default.query(updatedPostQuery, [postId]);
        res.status(200).json({
            message: "Post updated successfully.",
            post: updatedPostResult.rows,
            additionalData,
        });
    }
    catch (error) {
        console.error("Error updating post:", error);
        res.status(500).json({ message: "Internal server error." });
    }
});
exports.updatePost = updatePost;
const deletePost = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const client = req.supabase; // Supabase client from the request
    const userId = req.userId; // Extracted from JWT middleware
    const { id: postId } = req.params; // Post ID from request params
    try {
        // Check if the post exists and belongs to the user
        const postQuery = `
      SELECT id, user_id, forum_id, type
      FROM posts
      WHERE id = $1;
    `;
        const postResult = yield db_1.default.query(postQuery, [postId]);
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
        const mediaResult = yield db_1.default.query(mediaQuery, [postId]);
        if (mediaResult.rowCount && mediaResult.rowCount > 0) {
            const bucketName = "post-media"; // Bucket name for post media
            for (const media of mediaResult.rows) {
                yield (0, supabaseStorage_1.deleteFile)(client, bucketName, media.url); // Delete the media file
            }
        }
        // Delete associated data in type-specific tables
        switch (post.type) {
            case "personal":
                yield db_1.default.query(`DELETE FROM posts_personal WHERE post_id = $1;`, [
                    postId,
                ]);
                break;
            case "article":
                yield db_1.default.query(`DELETE FROM posts_article WHERE post_id = $1;`, [
                    postId,
                ]);
                break;
            case "polling":
                // Delete polling votes
                yield db_1.default.query(`DELETE FROM polling_votes WHERE polling_post_id = $1;`, [postId]);
                // Delete polling options
                yield db_1.default.query(`DELETE FROM polling_options WHERE polling_post_id = $1;`, [postId]);
                // Delete polling post
                yield db_1.default.query(`DELETE FROM posts_polling WHERE post_id = $1;`, [
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
        const deleteResult = yield db_1.default.query(deletePostQuery, [postId]);
        if (deleteResult.rowCount === 0) {
            res.status(500).json({ message: "Failed to delete the post." });
            return;
        }
        res.status(200).json({ message: "Post deleted successfully." });
    }
    catch (error) {
        console.error("Error deleting post:", error);
        res.status(500).json({ message: "Internal server error." });
    }
});
exports.deletePost = deletePost;
const likePost = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userId = req.userId;
    const { id: postId } = req.params;
    try {
        // Validate the post exists
        const postQuery = `
      SELECT id
      FROM posts
      WHERE id = $1;
    `;
        const postResult = yield db_1.default.query(postQuery, [postId]);
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
        const likeExistsResult = yield db_1.default.query(likeExistsQuery, [
            userId,
            postId,
        ]);
        if (likeExistsResult.rowCount && likeExistsResult.rowCount > 0) {
            res.status(400).json({ message: "You have already liked this post." });
            return;
        }
        const likeId = (0, uuid_1.v4)();
        const client = yield db_1.default.connect();
        try {
            yield client.query("BEGIN");
            // Insert like into the database
            const insertLikeQuery = `
        INSERT INTO post_likes (id, user_id, post_id)
        VALUES ($1, $2, $3);
      `;
            yield client.query(insertLikeQuery, [likeId, userId, postId]);
            // Increment likes_count on the post
            const updateLikesCountQuery = `
        UPDATE posts
        SET likes_count = likes_count + 1
        WHERE id = $1;
      `;
            yield client.query(updateLikesCountQuery, [postId]);
            yield client.query("COMMIT");
            res.status(201).json({ message: "Post liked successfully." });
        }
        catch (err) {
            yield client.query("ROLLBACK");
            console.error("Error during like transaction:", err);
            res.status(500).json({ message: "Internal server error." });
        }
        finally {
            client.release();
        }
    }
    catch (err) {
        console.error("Error liking post:", err);
        res.status(500).json({ message: "Internal server error." });
    }
});
exports.likePost = likePost;
const unlikePost = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userId = req.userId;
    const { id: postId } = req.params;
    try {
        // Check if the user has liked the post
        const likeExistsQuery = `
      SELECT id
      FROM post_likes
      WHERE user_id = $1 AND post_id = $2;
    `;
        const likeExistsResult = yield db_1.default.query(likeExistsQuery, [
            userId,
            postId,
        ]);
        if (likeExistsResult.rowCount === 0) {
            res.status(400).json({ message: "You have not liked this post." });
            return;
        }
        const client = yield db_1.default.connect();
        try {
            yield client.query("BEGIN");
            // Delete the like
            const deleteLikeQuery = `
        DELETE FROM post_likes
        WHERE user_id = $1 AND post_id = $2;
      `;
            yield client.query(deleteLikeQuery, [userId, postId]);
            // Decrement likes_count on the post
            const updateLikesCountQuery = `
        UPDATE posts
        SET likes_count = GREATEST(likes_count - 1, 0)
        WHERE id = $1;
      `;
            yield client.query(updateLikesCountQuery, [postId]);
            yield client.query("COMMIT");
            res.status(200).json({ message: "Post unliked successfully." });
        }
        catch (err) {
            yield client.query("ROLLBACK");
            console.error("Error during unlike transaction:", err);
            res.status(500).json({ message: "Internal server error." });
        }
        finally {
            client.release();
        }
    }
    catch (err) {
        console.error("Error unliking post:", err);
        res.status(500).json({ message: "Internal server error." });
    }
});
exports.unlikePost = unlikePost;
const bookmarkPost = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userId = req.userId;
    const { id: postId } = req.params;
    try {
        // Validate the post exists
        const postQuery = `
      SELECT id
      FROM posts
      WHERE id = $1;
    `;
        const postResult = yield db_1.default.query(postQuery, [postId]);
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
        const bookmarkExistsResult = yield db_1.default.query(bookmarkExistsQuery, [
            userId,
            postId,
        ]);
        if (bookmarkExistsResult.rowCount && bookmarkExistsResult.rowCount > 0) {
            res
                .status(400)
                .json({ message: "You have already bookmarked this post." });
            return;
        }
        const bookmarkId = (0, uuid_1.v4)();
        const client = yield db_1.default.connect();
        try {
            yield client.query("BEGIN");
            // Insert bookmark into the database
            const insertBookmarkQuery = `
        INSERT INTO post_bookmarks (id, user_id, post_id)
        VALUES ($1, $2, $3);
      `;
            yield client.query(insertBookmarkQuery, [bookmarkId, userId, postId]);
            // Increment bookmarks_count on the post
            const updateBookmarksCountQuery = `
        UPDATE posts
        SET bookmarks_count = bookmarks_count + 1
        WHERE id = $1;
      `;
            yield client.query(updateBookmarksCountQuery, [postId]);
            yield client.query("COMMIT");
            res.status(201).json({ message: "Post bookmarked successfully." });
        }
        catch (err) {
            yield client.query("ROLLBACK");
            console.error("Error during bookmark transaction:", err);
            res.status(500).json({ message: "Internal server error." });
        }
        finally {
            client.release();
        }
    }
    catch (err) {
        console.error("Error bookmarking post:", err);
        res.status(500).json({ message: "Internal server error." });
    }
});
exports.bookmarkPost = bookmarkPost;
const unbookmarkPost = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userId = req.userId;
    const { id: postId } = req.params;
    try {
        // Check if the user has bookmarked the post
        const bookmarkExistsQuery = `
      SELECT id
      FROM post_bookmarks
      WHERE user_id = $1 AND post_id = $2;
    `;
        const bookmarkExistsResult = yield db_1.default.query(bookmarkExistsQuery, [
            userId,
            postId,
        ]);
        if (bookmarkExistsResult.rowCount === 0) {
            res.status(400).json({ message: "You have not bookmarked this post." });
            return;
        }
        const client = yield db_1.default.connect();
        try {
            yield client.query("BEGIN");
            // Delete the bookmark
            const deleteBookmarkQuery = `
        DELETE FROM post_bookmarks
        WHERE user_id = $1 AND post_id = $2;
      `;
            yield client.query(deleteBookmarkQuery, [userId, postId]);
            // Decrement bookmarks_count on the post
            const updateBookmarksCountQuery = `
        UPDATE posts
        SET bookmarks_count = GREATEST(bookmarks_count - 1, 0)
        WHERE id = $1;
      `;
            yield client.query(updateBookmarksCountQuery, [postId]);
            yield client.query("COMMIT");
            res.status(200).json({ message: "Post unbookmarked successfully." });
        }
        catch (err) {
            yield client.query("ROLLBACK");
            console.error("Error during unbookmark transaction:", err);
            res.status(500).json({ message: "Internal server error." });
        }
        finally {
            client.release();
        }
    }
    catch (err) {
        console.error("Error unbookmarking post:", err);
        res.status(500).json({ message: "Internal server error." });
    }
});
exports.unbookmarkPost = unbookmarkPost;
// Repost or Quote a Post
const repostOrQuote = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userId = req.userId; // Extracted from JWT middleware
    const { originalPostId, type, interaction, content } = req.body;
    if (!originalPostId) {
        res.status(400).json({ message: "Original post ID is required." });
        return;
    }
    if (!interaction || !["repost", "quote"].includes(interaction)) {
        res.status(400).json({
            message: "Invalid interaction. Must be either 'repost' or 'quote'.",
        });
        return;
    }
    try {
        // Validate the original post exists
        const originalPostQuery = `
      SELECT id, type
      FROM posts
      WHERE id = $1;
    `;
        const originalPostResult = yield db_1.default.query(originalPostQuery, [
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
                message: "Invalid type. Type must match the original post or be 'personal'.",
            });
            return;
        }
        // If it's a quote, ensure content is provided
        if (interaction === "quote" && (!content || content.trim() === "")) {
            res
                .status(400)
                .json({ message: "Content is required for a quote post." });
            return;
        }
        // Generate a new UUID for the repost/quote
        const postId = (0, uuid_1.v4)();
        // Start a transaction for atomicity
        const client = yield db_1.default.connect();
        try {
            yield client.query("BEGIN");
            // Insert the repost/quote into the `posts` table
            const insertPostQuery = `
        INSERT INTO posts (id, user_id, original_post_id, type)
        VALUES ($1, $2, $3, $4)
        RETURNING *;
      `;
            const postResult = yield client.query(insertPostQuery, [
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
            yield client.query(incrementSharesQuery, [originalPostId]);
            const postShareId = (0, uuid_1.v4)();
            const insertPostShareQuery = `
          INSERT INTO post_shares (id, user_id, post_id, quote)
          VALUES ($1, $2, $3, $4)
          RETURNING *;
        `;
            yield client.query(insertPostShareQuery, [
                postShareId,
                userId,
                postId,
                content,
            ]);
            // Handle quote-specific logic
            if (interaction === "quote") {
                const insertPersonalQuery = `
          INSERT INTO posts_personal (post_id, content)
          VALUES ($1, $2)
          RETURNING *;
        `;
                const personalResult = yield client.query(insertPersonalQuery, [
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
            }
            else {
                // Repost logic only returns the main post
                res.status(201).json({ post: postResult.rows[0] });
            }
            yield client.query("COMMIT");
        }
        catch (err) {
            yield client.query("ROLLBACK");
            console.error("Error during repost/quote transaction:", err);
            res.status(500).json({ message: "Internal server error." });
        }
        finally {
            client.release();
        }
    }
    catch (err) {
        console.error("Error handling repost/quote:", err);
        res.status(500).json({ message: "Internal server error." });
    }
});
exports.repostOrQuote = repostOrQuote;
const unrepostOrUnquote = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userId = req.userId; // Extracted from JWT middleware
    const { postId } = req.body; // The ID of the repost/quote to delete
    if (!postId) {
        res.status(400).json({ message: "Post ID is required." });
        return;
    }
    try {
        // Start a transaction for atomicity
        const client = yield db_1.default.connect();
        try {
            yield client.query("BEGIN");
            // Fetch the repost/quote to ensure it exists and belongs to the user
            const repostQuery = `
        SELECT id, original_post_id, type
        FROM posts
        WHERE id = $1 AND user_id = $2;
      `;
            const repostResult = yield client.query(repostQuery, [postId, userId]);
            if (repostResult.rowCount === 0) {
                res.status(404).json({ message: "Repost or quote not found." });
                return;
            }
            const repost = repostResult.rows[0];
            // Delete the repost/quote from the database
            const deletePostQuery = `
        DELETE FROM posts
        WHERE id = $1;
      `;
            yield client.query(deletePostQuery, [postId]);
            // If it was a quote, delete its associated personal content
            if (repost.type === "personal") {
                const deletePersonalQuery = `
          DELETE FROM posts_personal
          WHERE post_id = $1;
        `;
                yield client.query(deletePersonalQuery, [postId]);
            }
            // Decrement `shares_count` of the original post
            const decrementSharesQuery = `
        UPDATE posts
        SET shares_count = GREATEST(shares_count - 1, 0)
        WHERE id = $1;
      `;
            yield client.query(decrementSharesQuery, [repost.original_post_id]);
            yield client.query("COMMIT");
            res
                .status(200)
                .json({ message: "Repost or quote deleted successfully." });
        }
        catch (err) {
            yield client.query("ROLLBACK");
            console.error("Error during unrepost/unquote transaction:", err);
            res.status(500).json({ message: "Internal server error." });
        }
        finally {
            client.release();
        }
    }
    catch (err) {
        console.error("Error handling unrepost/unquote:", err);
        res.status(500).json({ message: "Internal server error." });
    }
});
exports.unrepostOrUnquote = unrepostOrUnquote;
