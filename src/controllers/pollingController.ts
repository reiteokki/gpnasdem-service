import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import pool from "../db";

export const submitVote = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.userId; // Extracted from JWT middleware
  const { postId, selectedOptions } = req.body;

  // Validate input
  if (
    !postId ||
    !selectedOptions ||
    !Array.isArray(selectedOptions) ||
    selectedOptions.length === 0
  ) {
    res
      .status(400)
      .json({ message: "Post ID and selected options are required." });
    return;
  }

  const client = await pool.connect();

  try {
    // Start a transaction
    await client.query("BEGIN");

    // Fetch poll details
    const pollQuery = `
        SELECT p.end_datetime, p.allow_multiple_choices, p.is_anonymous, po.id AS option_id
        FROM posts_polling p
        JOIN polling_options po ON po.polling_post_id = p.post_id
        WHERE p.post_id = $1;
      `;
    const pollResult = await client.query(pollQuery, [postId]);

    if (pollResult.rowCount === 0) {
      res.status(404).json({ message: "Poll not found." });
      return;
    }

    const poll = pollResult.rows[0];

    // Check if poll has ended
    const now = new Date();
    const endDateTime = new Date(poll.end_datetime);
    if (now > endDateTime) {
      res.status(400).json({ message: "Voting is closed for this poll." });
      return;
    }

    // Check for existing votes if multiple choices are not allowed
    if (!poll.allow_multiple_choices) {
      const existingVoteQuery = `
          SELECT 1
          FROM polling_votes
          WHERE polling_post_id = $1 AND user_id = $2
        `;
      const existingVoteResult = await client.query(existingVoteQuery, [
        postId,
        userId,
      ]);

      if (existingVoteResult.rowCount && existingVoteResult.rowCount > 0) {
        res
          .status(400)
          .json({ message: "You have already voted for this poll." });
        await client.query("ROLLBACK");
        return;
      }
    }

    // Validate selected options
    const validOptionIds = pollResult.rows.map((row) => row.option_id);
    const invalidOptions = selectedOptions.filter(
      (optionId: string) => !validOptionIds.includes(optionId)
    );

    if (invalidOptions.length > 0) {
      res
        .status(400)
        .json({ message: "One or more selected options are invalid." });
      return;
    }

    // Check for duplicate votes
    if (!poll.is_anonymous) {
      const duplicateVoteQuery = `
          SELECT 1
          FROM polling_votes
          WHERE user_id = $1 AND polling_post_id = $2 AND option_id = ANY($3::uuid[])
        `;
      const duplicateVoteResult = await client.query(duplicateVoteQuery, [
        userId,
        postId,
        selectedOptions,
      ]);

      if (duplicateVoteResult.rowCount && duplicateVoteResult.rowCount > 0) {
        res.status(400).json({
          message:
            "You have already voted for one or more of the selected options.",
        });
        return;
      }
    }

    // Record votes
    const insertVoteQuery = `
        INSERT INTO polling_votes (id, polling_post_id, user_id, option_id, created_at)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      `;

    // Increment vote count for the option
    const updateOptionQuery = `
          UPDATE polling_options
          SET votes_count = votes_count + 1
          WHERE id = $1
        `;

    for (const optionId of selectedOptions) {
      const voteId = uuidv4();

      // Insert vote
      await client.query(insertVoteQuery, [
        voteId,
        postId,
        poll.is_anonymous ? null : userId, // Nullify user ID if poll is anonymous
        optionId,
      ]);

      await client.query(updateOptionQuery, [optionId]);
    }

    // Commit the transaction
    await client.query("COMMIT");

    res.status(200).json({ message: "Vote submitted successfully." });
  } catch (error) {
    // Rollback the transaction in case of an error
    await client.query("ROLLBACK");

    console.error("Error submitting vote:", error);
    res.status(500).json({ message: "Internal server error." });
  } finally {
    client.release(); // Release the client back to the pool
  }
};

export const getPollResults = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id: postId } = req.params;

  try {
    // Fetch poll details
    const pollQuery = `
        SELECT p.post_id, p.is_anonymous, po.id AS option_id, po.text, po.votes_count
        FROM posts_polling p
        JOIN polling_options po ON po.polling_post_id = p.post_id
        WHERE p.post_id = $1;
      `;
    const pollResult = await pool.query(pollQuery, [postId]);

    if (pollResult.rowCount === 0) {
      res.status(404).json({ message: "Poll not found." });
      return;
    }

    const pollData = pollResult.rows.map((row) => ({
      optionId: row.option_id,
      text: row.text,
      votesCount: row.votes_count,
    }));

    const isAnonymous = pollResult.rows[0]?.is_anonymous;

    res.status(200).json({
      postId,
      isAnonymous,
      options: pollData,
    });
  } catch (error) {
    console.error("Error fetching poll results:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};
