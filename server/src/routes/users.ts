import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../db';
import { authenticate, requireRole, JWT_SECRET, JWT_EXPIRES_IN } from '../auth';
import type { Role } from '../auth';

const router = Router();

// ────────────────────────────────────────────
// POST /api/auth/login
// ────────────────────────────────────────────
router.post(
  '/login',
  [
    body('username').notEmpty().trim(),
    body('password').notEmpty(),
  ],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { username, password } = req.body;
    const [rows]: any = await pool.query(
      'SELECT id, username, password_hash, role, display_name FROM users WHERE username = ? AND is_active = 1',
      [username]
    );
    if (rows.length === 0) return res.status(401).json({ error: 'ユーザー名またはパスワードが違います' });

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'ユーザー名またはパスワードが違います' });

    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    res.json({
      token,
      user: { id: user.id, username: user.username, role: user.role, display_name: user.display_name },
    });
  }
);

// ────────────────────────────────────────────
// GET /api/auth/me  (自分の情報)
// ────────────────────────────────────────────
router.get('/me', authenticate, async (req: any, res: any) => {
  const [rows]: any = await pool.query(
    'SELECT id, username, role, display_name, created_at FROM users WHERE id = ?',
    [req.user.userId]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

// ────────────────────────────────────────────
// GET /api/users  (admin only)
// ────────────────────────────────────────────
router.get('/', authenticate, requireRole('admin'), async (_req, res) => {
  const [rows] = await pool.query(
    'SELECT id, username, role, display_name, is_active, created_at FROM users ORDER BY id'
  );
  res.json(rows);
});

// ────────────────────────────────────────────
// POST /api/users  (admin only)
// ────────────────────────────────────────────
router.post(
  '/',
  authenticate,
  requireRole('admin'),
  [
    body('username').notEmpty().trim().isLength({ min: 3, max: 50 }),
    body('password').isLength({ min: 6 }),
    body('role').isIn(['admin', 'manager', 'viewer']),
    body('display_name').optional().trim().isLength({ max: 100 }),
  ],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { username, password, role, display_name } = req.body;
    const hash = await bcrypt.hash(password, 10);
    try {
      const [result]: any = await pool.query(
        'INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, ?, ?)',
        [username, hash, role as Role, display_name ?? username]
      );
      const [rows]: any = await pool.query(
        'SELECT id, username, role, display_name, is_active FROM users WHERE id = ?',
        [result.insertId]
      );
      res.status(201).json(rows[0]);
    } catch (err: any) {
      if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'ユーザー名が重複しています' });
      throw err;
    }
  }
);

// ────────────────────────────────────────────
// PUT /api/users/:id  (admin only)
// ────────────────────────────────────────────
router.put(
  '/:id',
  authenticate,
  requireRole('admin'),
  [
    body('role').optional().isIn(['admin', 'manager', 'viewer']),
    body('display_name').optional().trim().isLength({ max: 100 }),
    body('is_active').optional().isBoolean(),
    body('password').optional().isLength({ min: 6 }),
  ],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const fields: string[] = [];
    const values: any[] = [];

    if (req.body.role !== undefined) { fields.push('role = ?'); values.push(req.body.role); }
    if (req.body.display_name !== undefined) { fields.push('display_name = ?'); values.push(req.body.display_name); }
    if (req.body.is_active !== undefined) { fields.push('is_active = ?'); values.push(req.body.is_active ? 1 : 0); }
    if (req.body.password) {
      const hash = await bcrypt.hash(req.body.password, 10);
      fields.push('password_hash = ?');
      values.push(hash);
    }
    if (fields.length === 0) return res.status(400).json({ error: '更新フィールドがありません' });

    values.push(req.params.id);
    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
    const [rows]: any = await pool.query(
      'SELECT id, username, role, display_name, is_active FROM users WHERE id = ?',
      [req.params.id]
    );
    res.json(rows[0]);
  }
);

export default router;
