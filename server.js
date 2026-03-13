const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
// Serves index.html automatically when you open http://localhost:3000
app.use(express.static(path.join(__dirname)));

// Database connection — replace the password with your actual postgres password
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'eventmanager',
  password: 'Cranbrook1',
  port: 5432
});

// ── EVENTS ────────────────────────────────────────────────────────────────────

// GET all events (joined with event type name)
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

// GET single event by ID
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

// POST create a new event
app.post('/api/events', async (req, res) => {
  const { title, description, location, event_date, capacity, type_id } = req.body;
  if (!title || !event_date || !type_id) {
    return res.status(400).json({ error: 'title, event_date, and type_id are required' });
  }
  try {
    const result = await pool.query(`
      INSERT INTO events (title, description, location, event_date, capacity, type_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [title, description || null, location || null, event_date, capacity || null, type_id]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('POST /api/events error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE an event by ID
// Note: ON DELETE CASCADE in the DB automatically removes related registrations
app.delete('/api/events/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM events WHERE event_id = $1 RETURNING *', [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Event not found' });
    res.json({ message: 'Event deleted successfully' });
  } catch (err) {
    console.error('DELETE /api/events/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── USERS ─────────────────────────────────────────────────────────────────────

// GET all users (never expose password_hash to the frontend)
app.get('/api/users', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT user_id, first_name, last_name, email, created_at FROM users ORDER BY last_name'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/users error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST create a new user
// password_hash is NOT NULL in the schema, so we store a placeholder value.
// In a real app you would hash a real password here.
app.post('/api/users', async (req, res) => {
  const { first_name, last_name, email } = req.body;
  if (!first_name || !last_name || !email) {
    return res.status(400).json({ error: 'first_name, last_name, and email are required' });
  }
  try {
    const result = await pool.query(`
      INSERT INTO users (first_name, last_name, email, password_hash)
      VALUES ($1, $2, $3, $4)
      RETURNING user_id, first_name, last_name, email, created_at
    `, [first_name, last_name, email, 'placeholder']);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    // Unique constraint on email
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }
    console.error('POST /api/users error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE a user by ID
// Note: ON DELETE CASCADE in the DB automatically removes their registrations
app.delete('/api/users/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM users WHERE user_id = $1 RETURNING *', [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('DELETE /api/users/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── REGISTRATIONS ─────────────────────────────────────────────────────────────

// GET all registrations (joined with user and event info)
app.get('/api/registrations', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        registrations.registration_id,
        registrations.registration_date,
        registrations.status,
        users.user_id,
        users.first_name,
        users.last_name,
        users.email,
        events.event_id,
        events.title,
        events.event_date,
        event_types.type_name
      FROM registrations
      JOIN users       ON registrations.user_id  = users.user_id
      JOIN events      ON registrations.event_id = events.event_id
      JOIN event_types ON events.type_id         = event_types.type_id
      ORDER BY registrations.registration_date DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/registrations error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST register a user for an event
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
    if (err.code === '23505') {
      return res.status(409).json({ error: 'This user is already registered for that event' });
    }
    console.error('POST /api/registrations error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE a registration by ID
app.delete('/api/registrations/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM registrations WHERE registration_id = $1 RETURNING *', [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Registration not found' });
    res.json({ message: 'Registration cancelled successfully' });
  } catch (err) {
    console.error('DELETE /api/registrations/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── EVENT TYPES ───────────────────────────────────────────────────────────────

// GET all event types
app.get('/api/event-types', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM event_types ORDER BY type_name');
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/event-types error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── START SERVER ──────────────────────────────────────────────────────────────
// app.listen() must always be last — all routes defined above this line
app.listen(PORT, () => {
  console.log(`✅  Server running → http://localhost:${PORT}`);
  console.log('');
  console.log('  API endpoints:');
  console.log('  GET    /api/events');
  console.log('  POST   /api/events');
  console.log('  DELETE /api/events/:id');
  console.log('  GET    /api/users');
  console.log('  POST   /api/users');
  console.log('  DELETE /api/users/:id');
  console.log('  GET    /api/registrations');
  console.log('  POST   /api/registrations');
  console.log('  DELETE /api/registrations/:id');
  console.log('  GET    /api/event-types');
});