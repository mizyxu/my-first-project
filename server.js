const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const app = express();
const PORT = 3000;
app.use(cors());
app.use(express.json());

const pool = new Pool({
user: 'postgres',
host: 'localhost',
database: 'eventmanager',
password: 'Cranbrook1',
port: 5432
});

app.get("/events", async (req, res) => {
  const result = await pool.query(`
    SELECT e.event_id, e.title, e.location, e.event_date, t.type_name
    FROM events e
    JOIN event_types t ON e.type_id = t.type_id
    ORDER BY event_date
  `);

  res.json(result.rows);
});

// Register user for event
app.post("/register", async (req, res) => {
  const { user_id, event_id } = req.body;

  await pool.query(
    "INSERT INTO registrations (user_id, event_id) VALUES ($1, $2)",
    [user_id, event_id]
  );

  res.send("Registration successful");
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});