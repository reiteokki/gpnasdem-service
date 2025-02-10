"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables from .env file
dotenv_1.default.config();
// Database connection configuration
const pool = new pg_1.Pool({
    user: process.env.DB_USER || "user", // Replace with your database user
    host: process.env.DB_HOST || "host", // Replace with your database host
    database: process.env.DB_NAME || "dbname", // Replace with your database name
    password: process.env.DB_PASSWORD || "password", // Replace with your database password
    port: parseInt(process.env.DB_PORT || "5432", 10), // Replace with your database port
});
// Test the connection
pool.connect((err, client, release) => {
    if (err) {
        console.error("Error acquiring client:", err.stack);
    }
    else {
        console.log("Database connected successfully");
        release(); // Release the client back to the pool
    }
});
// Export the pool to use in other parts of the application
exports.default = pool;
