import pool from "../db";

interface ForumMemberData {
  forumId: string;
  userId: string;
  isCore: boolean;
  isApproved: boolean;
}

export const addForumMember = async ({
  forumId,
  userId,
  isCore,
  isApproved,
}: ForumMemberData): Promise<any> => {
  const query = `
    INSERT INTO forum_members (
      forum_id, user_id, is_core, is_approved, approved_at, joined_at
    ) VALUES ($1, $2, $3, $4, 
      CASE WHEN $4 = true THEN CURRENT_TIMESTAMP ELSE NULL END, 
      CURRENT_TIMESTAMP
    )
    RETURNING forum_id, user_id, is_core, is_approved, approved_at, joined_at;
  `;

  const values = [forumId, userId, isCore, isApproved];

  const result = await pool.query(query, values);

  return result.rows[0];
};
