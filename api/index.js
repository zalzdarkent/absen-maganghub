// Vercel Serverless entrypoint untuk semua route Express di server.js
// Semua request /api/* dan fallback akan di-rewrite ke sini via vercel.json
import app from '../server.js';

export default app;
