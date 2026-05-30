import { createApp } from './api';

const port = Number.parseInt(process.env.PORT ?? '5174', 10);
const host = process.env.HOST ?? '127.0.0.1';
const app = createApp();

app.listen(port, host, () => {
  console.log(`StyleMakar API listening at http://${host}:${port}`);
});
