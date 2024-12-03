import pool from "../db";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";

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

export const createRegistration = async (
  userId: string,
  idNumber: string,
  birthPlace: string,
  birthDate: string,
  zone: string,
  latestEducation: string,
  address: string,
  nik: string,
  phone: string,
  referral: string
) => {
  const regisId = uuidv4();
  const client = await pool.connect();

  try {
    // Begin transaction
    await client.query("BEGIN");

    const result = await client.query(
      `INSERT INTO users_registration (id, user_id, id_number, birth_place, birth_date, zone, latest_education, address, nik, phone_number, referral)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [
        regisId,
        userId,
        idNumber,
        birthPlace,
        birthDate,
        zone,
        latestEducation,
        address,
        nik,
        phone,
        referral,
      ]
    );

    // Commit transaction
    await client.query("COMMIT");

    return result.rows[0];
  } catch (err) {
    if (client) {
      // Rollback transaction on error
      await client.query("ROLLBACK");
    }
    console.error("Error during registerSelfToMember:", err);
    throw new Error("Database error during registerSelfToMember");
  } finally {
    if (client) {
      // Release the client back to the pool
      client.release();
    }
  }
};

export const promoteToMember = async (
  userId: string,
  idNumber: string,
  birthPlace: string,
  birthDate: string,
  zone: string,
  latestEducation: string,
  address: string,
  nik: string,
  phone: string,
  referral: string
) => {
  const client = await pool.connect(); // Use a pooled client for transactions

  try {
    // Begin a transaction
    await client.query("BEGIN");

    // Insert the new member into the `users_member` table
    const memberResult = await client.query(
      `INSERT INTO users_member (user_id, id_number, birth_place, birth_date, zone, latest_education, address, nik, phone_number, referral)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        userId,
        idNumber,
        birthPlace,
        birthDate,
        zone,
        latestEducation,
        address,
        nik,
        phone,
        referral,
      ]
    );

    // Update the `is_verified` column in the `users` table
    await client.query(
      `UPDATE users
       SET is_verified = true
       WHERE id = $1`,
      [userId]
    );

    await client.query(
      `UPDATE users_registration
       SET status = 'active'
       WHERE user_id = $1`,
      [userId]
    );

    // Commit the transaction
    await client.query("COMMIT");

    console.log("Insert result:", memberResult);
    return memberResult.rows[0];
  } catch (err) {
    // Rollback the transaction on error
    await client.query("ROLLBACK");
    console.error("Error during promoteToMember:", err);
    throw new Error("Database error during promoteToMember");
  } finally {
    // Release the client back to the pool
    client.release();
  }
};
