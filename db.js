const mysql = require('mysql2/promise');

if (!process.env.DB_USER || !process.env.DB_NAME) {
  console.warn('[DB] DB_USER or DB_NAME not set. Database operations may fail.');
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;
