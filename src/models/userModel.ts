import pool from "../db";
import bcrypt from "bcrypt";

export const createUser = async (
  id: string,
  email: string,
  username: string,
  displayName: string
) => {
  const result = await pool.query(
    `INSERT INTO users (id, email, username, display_name)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [id, email, username, displayName]
  );
  await pool.query(`INSERT INTO users_normal (user_id) VALUES ($1)`, [
    result.rows[0].id,
  ]);
  return result.rows[0];
};

export const promoteToMember = async (
  userId: string,
  idNumber: string,
  birthPlace: string,
  birthDate: Date,
  zone: string,
  latestEducation: string
) => {
  try {
    const result = await pool.query(
      `INSERT INTO users_member (user_id, id_number, birth_place, birth_date, zone, latest_education)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [userId, idNumber, birthPlace, birthDate, zone, latestEducation]
    );

    console.log("Insert result:", result);
    return result.rows[0];
  } catch (err) {
    console.error("Error during promoteToMember:", err);
    throw new Error("Database error during promoteToMember");
  }
};
