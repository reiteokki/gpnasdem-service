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
exports.addForumMember = void 0;
const db_1 = __importDefault(require("../db"));
const addForumMember = (_a) => __awaiter(void 0, [_a], void 0, function* ({ forumId, userId, isCore, isApproved, }) {
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
    const result = yield db_1.default.query(query, values);
    return result.rows[0];
});
exports.addForumMember = addForumMember;
