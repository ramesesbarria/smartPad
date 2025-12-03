const mysql = require("mysql2/promise");

let pool = null;

try {
  pool = mysql.createPool({
    host: "localhost",
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    connectionLimit: 5
  });
} catch (err) {
  console.error("DB init failed:", err);
}

module.exports = pool;
