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
exports.promoteToMember = exports.createRegistration = exports.createUser = void 0;
const db_1 = __importDefault(require("../db"));
const uuid_1 = require("uuid");
const createUser = (id, email, username, displayName) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield db_1.default.query(`INSERT INTO users (id, email, username, display_name)
     VALUES ($1, $2, $3, $4) RETURNING *`, [id, email, username, displayName]);
    yield db_1.default.query(`INSERT INTO users_normal (user_id) VALUES ($1)`, [
        result.rows[0].id,
    ]);
    return result.rows[0];
});
exports.createUser = createUser;
const createRegistration = (userId, idNumber, birthPlace, birthDate, zone, latestEducation, address, nik, phone, referral) => __awaiter(void 0, void 0, void 0, function* () {
    const regisId = (0, uuid_1.v4)();
    const client = yield db_1.default.connect();
    try {
        // Begin transaction
        yield client.query("BEGIN");
        const result = yield client.query(`INSERT INTO users_registration (id, user_id, id_number, birth_place, birth_date, zone, latest_education, address, nik, phone_number, referral)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`, [
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
        ]);
        // Commit transaction
        yield client.query("COMMIT");
        return result.rows[0];
    }
    catch (err) {
        if (client) {
            // Rollback transaction on error
            yield client.query("ROLLBACK");
        }
        console.error("Error during registerSelfToMember:", err);
        throw new Error("Database error during registerSelfToMember");
    }
    finally {
        if (client) {
            // Release the client back to the pool
            client.release();
        }
    }
});
exports.createRegistration = createRegistration;
const promoteToMember = (userId, idNumber, birthPlace, birthDate, zone, latestEducation, address, nik, phone, referral) => __awaiter(void 0, void 0, void 0, function* () {
    const client = yield db_1.default.connect(); // Use a pooled client for transactions
    try {
        // Begin a transaction
        yield client.query("BEGIN");
        // Insert the new member into the `users_member` table
        const memberResult = yield client.query(`INSERT INTO users_member (user_id, id_number, birth_place, birth_date, zone, latest_education, address, nik, phone_number, referral)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`, [
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
        ]);
        // Update the `is_verified` column in the `users` table
        yield client.query(`UPDATE users
       SET is_verified = true
       WHERE id = $1`, [userId]);
        yield client.query(`UPDATE users_registration
       SET status = 'active'
       WHERE user_id = $1`, [userId]);
        // Commit the transaction
        yield client.query("COMMIT");
        // console.log("Insert result:", memberResult);
        return memberResult.rows[0];
    }
    catch (err) {
        // Rollback the transaction on error
        yield client.query("ROLLBACK");
        console.error("Error during promoteToMember:", err);
        throw new Error("Database error during promoteToMember");
    }
    finally {
        // Release the client back to the pool
        client.release();
    }
});
exports.promoteToMember = promoteToMember;
