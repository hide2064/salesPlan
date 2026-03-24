import express from 'express';
import cors from 'cors';
import { initSchema } from './db';
import { authenticate, requireRole } from './auth';
import usersRouter from './routes/users';
import categoriesRouter from './routes/categories';
import productsRouter from './routes/products';
import salesRouter from './routes/sales';
import forecastsRouter from './routes/forecasts';
import reportsRouter from './routes/reports';
import importExportRouter from './routes/importExport';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// 認証不要: ログイン
app.use('/api/auth', usersRouter);

// 認証必須: 全APIに適用
app.use('/api', authenticate);

// ユーザー管理 (admin only は routes/users 内で制御)
app.use('/api/users', usersRouter);

// 参照系: viewer以上
app.use('/api/categories', categoriesRouter);
app.use('/api/products', productsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/export', importExportRouter);

// 書き込み系: manager以上 (各ルート内でも制御可能だが、ここで一括ガード)
app.use('/api/sales',    requireRole('manager'), salesRouter);
app.use('/api/forecasts', requireRole('manager'), forecastsRouter);
app.use('/api/import',   requireRole('manager'), importExportRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

async function start() {
  await initSchema();
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

export default app;
