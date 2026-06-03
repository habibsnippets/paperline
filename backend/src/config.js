import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  dbPath: process.env.DB_PATH || './data/paperline.db',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
};
