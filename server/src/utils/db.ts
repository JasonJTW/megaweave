const dotenv = require("dotenv");
dotenv.config();
import mysql, { RowDataPacket } from "mysql2";
const DB_HOST = process.env.DB_HOST;
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_DATABASE = process.env.DB_DATABASE;
const DB_PORT = process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306;
const dbPool = mysql
  .createPool({
    host: DB_HOST,
    user: DB_USER,
    port: DB_PORT,
    password: DB_PASSWORD,
    database: DB_DATABASE,
    waitForConnections: true,
  })
  .promise();

export default dbPool;
