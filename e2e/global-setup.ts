// Fails fast with an actionable message instead of letting every test time out
// individually when the compose stack isn't running.
async function ping(url: string, name: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status}`);
  } catch {
    throw new Error(
      `${name} is not reachable at ${url}.\n` +
        `Run: docker compose up --build -d\n` +
        `(E2E tests target the compose stack, not the Vite dev server.)`
    );
  }
}

export default async function globalSetup() {
  await ping("http://localhost:8080/api/health", "The app (nginx/backend)");
  await ping("http://localhost:8025", "Mailpit");
}
