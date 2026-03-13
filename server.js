const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Database connection — replace the password with your actual postgres password
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'eventmanager',
  password: 'Cranbrook1',
  port: 5432
});

// Test the DB connection on startup so you know immediately if it fails
pool.query('SELECT NOW()', (err) => {
  if (err) {
    console.error('❌ Database connection FAILED:', err.message);
    console.error('   Check your password and that PostgreSQL is running.');
  } else {
    console.log('✅ Database connected successfully');
  }
});

// ── EVENTS ────────────────────────────────────────────────────────────────────

// GET all events
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
  console.log('POST /api/events body:', req.body); // log incoming data
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
    console.log('Event created:', result.rows[0]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('POST /api/events error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE an event by ID
app.delete('/api/events/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM registrations WHERE event_id = $1', [req.params.id]);
    const result = await pool.query('DELETE FROM events WHERE event_id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Event not found' });
    res.json({ message: 'Event deleted successfully' });
  } catch (err) {
    console.error('DELETE /api/events/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── USERS ─────────────────────────────────────────────────────────────────────

// GET all users
// NOTE: We check which columns exist rather than assuming created_at is present
app.get('/api/users', async (req, res) => {
  try {
    // First find out which columns actually exist in the users table
    const colCheck = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'users'
    `);
    const cols = colCheck.rows.map(r => r.column_name);
    console.log('users table columns:', cols);

    // Build SELECT list from what actually exists
    const select = ['user_id', 'first_name', 'last_name', 'email']
      .filter(c => cols.includes(c));
    if (cols.includes('created_at')) select.push('created_at');

    const result = await pool.query(
      `SELECT ${select.join(', ')} FROM users ORDER BY last_name`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/users error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST create a new user
app.post('/api/users', async (req, res) => {
  console.log('POST /api/users body:', req.body); // log incoming data
  const { first_name, last_name, email } = req.body;
  if (!first_name || !last_name || !email) {
    return res.status(400).json({ error: 'first_name, last_name, and email are required' });
  }
  try {
    // Check which columns exist so we don't SELECT a missing created_at
    const colCheck = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'users'
    `);
    const cols = colCheck.rows.map(r => r.column_name);

    const returning = ['user_id', 'first_name', 'last_name', 'email']
      .filter(c => cols.includes(c));
    if (cols.includes('created_at')) returning.push('created_at');

    const result = await pool.query(`
      INSERT INTO users (first_name, last_name, email)
      VALUES ($1, $2, $3)
      RETURNING ${returning.join(', ')}
    `, [first_name, last_name, email]);

    console.log('User created:', result.rows[0]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }
    console.error('POST /api/users error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE a user by ID
app.delete('/api/users/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM registrations WHERE user_id = $1', [req.params.id]);
    const result = await pool.query('DELETE FROM users WHERE user_id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('DELETE /api/users/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── REGISTRATIONS ─────────────────────────────────────────────────────────────

// GET all registrations
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
      ORDER BY registrations.registration_id DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/registrations error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST register a user for an event
app.post('/api/registrations', async (req, res) => {
  console.log('POST /api/registrations body:', req.body);
  const { user_id, event_id } = req.body;
  if (!user_id || !event_id) {
    return res.status(400).json({ error: 'user_id and event_id are required' });
  }
  try {
    // Check which columns exist in registrations (status and registration_date may or may not be there)
    const colCheck = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'registrations'
    `);
    const cols = colCheck.rows.map(r => r.column_name);
    console.log('registrations table columns:', cols);

    // Build the INSERT based on what columns actually exist
    let query, params;
    if (cols.includes('status') && cols.includes('registration_date')) {
      query = `INSERT INTO registrations (user_id, event_id, status)
               VALUES ($1, $2, 'confirmed') RETURNING *`;
    } else if (cols.includes('status')) {
      query = `INSERT INTO registrations (user_id, event_id, status)
               VALUES ($1, $2, 'confirmed') RETURNING *`;
    } else {
      query = `INSERT INTO registrations (user_id, event_id)
               VALUES ($1, $2) RETURNING *`;
    }
    params = [user_id, event_id];

    const result = await pool.query(query, params);
    console.log('Registration created:', result.rows[0]);
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
app.listen(PORT, () => {
  console.log('');
  console.log(`🚀 Server running → http://localhost:${PORT}`);
  console.log('');
  console.log('  Endpoints:');
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
  console.log('');
});