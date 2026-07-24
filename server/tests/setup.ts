Object.assign(process.env, {
  NODE_ENV:"test",
  DATABASE_URL:"postgresql://test:test@localhost:5432/intellix_test",
  DIRECT_URL:"postgresql://test:test@localhost:5432/intellix_test",
  JWT_ACCESS_SECRET:"test-access-secret-that-is-at-least-32-characters",
  JWT_REFRESH_SECRET:"test-refresh-secret-that-is-at-least-32-characters",
  FRONTEND_URL:"http://localhost:3000",
  LOCAL_UPLOAD_DIR:".test-uploads",
});
