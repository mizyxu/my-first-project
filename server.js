const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
// Serve index.html from the same folder as server.js
app.use(express.static(path.join(__dirname)));

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'eventmanager',
  password: 'Cranbrook1',   // <-- replace with your actual password
  port: 5432
});

// ── Events ──────────────────────────────────────────────────────────────────
app.get('/api/events', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT events.*, event_types.type_name
      FROM events
      JOIN event_types ON events.type_id = event_types.type_id
      ORDER BY event_date
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/events error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Single event ─────────────────────────────────────────────────────────────
app.get('/api/events/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT events.*, event_types.type_name
      FROM events
      JOIN event_types ON events.type_id = event_types.type_id
      WHERE events.event_id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Event not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('GET /api/events/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Registrations ────────────────────────────────────────────────────────────
app.get('/api/registrations', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        registrations.registration_id,
        users.first_name,
        users.last_name,
        users.email,
        events.title,
        events.event_date,
        event_types.type_name
      FROM registrations
      JOIN users      ON registrations.user_id  = users.user_id
      JOIN events     ON registrations.event_id = events.event_id
      JOIN event_types ON events.type_id        = event_types.type_id
      ORDER BY events.event_date
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/registrations error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Register a user for an event ─────────────────────────────────────────────
app.post('/api/registrations', async (req, res) => {
  const { user_id, event_id } = req.body;
  if (!user_id || !event_id) {
    return res.status(400).json({ error: 'user_id and event_id are required' });
  }
  try {
    const result = await pool.query(`
      INSERT INTO registrations (user_id, event_id)
      VALUES ($1, $2)
      RETURNING *
    `, [user_id, event_id]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    // Unique-violation → already registered
    if (err.code === '23505') {
      return res.status(409).json({ error: 'User already registered for this event' });
    }
    console.error('POST /api/registrations error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Event types ───────────────────────────────────────────────────────────────
app.get('/api/event-types', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM event_types ORDER BY type_name');
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/event-types error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Users ─────────────────────────────────────────────────────────────────────
app.get('/api/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT user_id, first_name, last_name, email FROM users ORDER BY last_name');
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/users error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Start server ──────────────────────────────────────────────────────────────
// NOTE: app.listen() is LAST — all routes must be defined before this line
app.listen(PORT, () => {
  console.log(`✅  Server running → http://localhost:${PORT}`);
  console.log('    Routes available:');
  console.log('      GET  /api/events');
  console.log('      GET  /api/events/:id');
  console.log('      GET  /api/registrations');
  console.log('      POST /api/registrations');
  console.log('      GET  /api/event-types');
  console.log('      GET  /api/users');
});