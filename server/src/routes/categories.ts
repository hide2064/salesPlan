/**
 * routes/categories.ts
 * ─────────────────────────────────────────────────────────────
 * カテゴリマスタ (categories テーブル) の CRUD API ルーター。
 * カテゴリは売上・予定売上の分類に使用される最上位マスタ。
 *
 * エンドポイント一覧:
 *   GET    /api/categories       カテゴリ一覧取得 (全件・sort_order順)
 *   POST   /api/categories       カテゴリ新規登録
 *   PUT    /api/categories/:id   カテゴリ更新 (部分更新)
 *   DELETE /api/categories/:id   カテゴリ無効化 (論理削除)
 *
 * アクセス制御: viewer 以上 (index.ts で設定)
 * ─────────────────────────────────────────────────────────────
 */
import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import pool from '../db';

const router = Router();

// ─────────────────────────────────────────────────────────────
// GET /api/categories
// カテゴリ一覧取得 (is_active を問わず全件返す)
// ─────────────────────────────────────────────────────────────
/**
 * フロントエンドでの利用:
 *   - 売上入力フォームのカテゴリ選択
 *   - 製品管理のカテゴリ一覧表示
 *   - 各種フィルタのオプション生成
 *
 * sort_order, id でソートすることで、意図した表示順を維持。
 * is_active=0 (無効) のカテゴリも含めて返す → フロント側でフィルタする。
 */
router.get('/', async (_req, res) => {
  const [rows] = await pool.query(
    'SELECT * FROM categories ORDER BY sort_order, id'
  );
  res.json(rows);
});

// ─────────────────────────────────────────────────────────────
// POST /api/categories
// カテゴリ新規登録
// ─────────────────────────────────────────────────────────────
/**
 * リクエストボディ:
 *   name       (必須) : カテゴリ名 (最大100文字、一意)
 *   sort_order (任意) : 表示順 (デフォルト 0、値が小さいほど先頭)
 *
 * エラーケース:
 *   - name が重複: 409 Conflict
 */
router.post(
  '/',
  [
    body('name').notEmpty().trim().isLength({ max: 100 }),
    body('sort_order').optional().isInt({ min: 0 }),
  ],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, sort_order = 0 } = req.body;
    try {
      const [result]: any = await pool.query(
        'INSERT INTO categories (name, sort_order) VALUES (?, ?)',
        [name, sort_order]
      );
      // 挿入した行を再取得してレスポンス (created_at 等のデフォルト値も含む)
      const [rows]: any = await pool.query('SELECT * FROM categories WHERE id = ?', [result.insertId]);
      res.status(201).json(rows[0]);
    } catch (err: any) {
      // MySQL の一意制約違反: uk_categories_name
      if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'カテゴリ名が重複しています' });
      throw err;
    }
  }
);

// ─────────────────────────────────────────────────────────────
// PUT /api/categories/:id
// カテゴリ更新 (部分更新)
// ─────────────────────────────────────────────────────────────
/**
 * リクエストボディ (送信したフィールドのみ更新):
 *   name       : カテゴリ名変更
 *   sort_order : 表示順変更
 *   is_active  : 有効/無効フラグ (true/false)
 *
 * is_active=false の送信は論理削除相当。
 * DELETE エンドポイントも同様に is_active=0 を設定する。
 */
router.put(
  '/:id',
  [
    body('name').optional().trim().isLength({ max: 100 }),
    body('sort_order').optional().isInt({ min: 0 }),
    body('is_active').optional().isBoolean(),
  ],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, sort_order, is_active } = req.body;
    const fields: string[] = [];
    const values: any[] = [];

    // 送信されたフィールドのみ SET 句に追加 (ホワイトリスト方式)
    if (name !== undefined)       { fields.push('name = ?');       values.push(name); }
    if (sort_order !== undefined) { fields.push('sort_order = ?'); values.push(sort_order); }
    if (is_active !== undefined)  { fields.push('is_active = ?');  values.push(is_active ? 1 : 0); }

    if (fields.length === 0) return res.status(400).json({ error: '更新フィールドがありません' });

    values.push(req.params.id);
    await pool.query(`UPDATE categories SET ${fields.join(', ')} WHERE id = ?`, values);

    const [rows]: any = await pool.query('SELECT * FROM categories WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  }
);

// ─────────────────────────────────────────────────────────────
// DELETE /api/categories/:id
// カテゴリ論理削除 (is_active = 0 に設定)
// ─────────────────────────────────────────────────────────────
/**
 * 物理削除しない理由:
 *   - 既存の sales / forecasts が category_id を外部キーで参照しているため
 *     物理削除すると参照整合性エラーが発生する
 *   - 過去の売上データの集計・表示には論理削除されたカテゴリ名が必要
 *
 * 削除後は一覧表示から除外されるが、既存データへの参照は維持される。
 */
router.delete('/:id', async (req: any, res: any) => {
  await pool.query('UPDATE categories SET is_active = 0 WHERE id = ?', [req.params.id]);
  res.status(204).send();
});

export default router;
