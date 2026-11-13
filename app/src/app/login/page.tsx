"use client";

import { Alert, Button, Center, Paper, PasswordInput, Stack, Title } from "@mantine/core";
import { useState, type FormEvent } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) location.href = "/";
    else setError(res?.status === 401 ? "Wrong password." : "Sign in failed. Try again.");
  }

  return (
    <Center mih="100vh" p="md">
      <Paper withBorder p="xl" w="100%" maw={360} component="form" onSubmit={submit}>
        <Stack>
          <Title order={1} size="h3">Spend Lens</Title>
          <PasswordInput
            label="Password"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            autoComplete="current-password"
            autoFocus
            required
          />
          {error && <Alert color="red" role="alert">{error}</Alert>}
          <Button type="submit" loading={busy}>Sign in</Button>
        </Stack>
      </Paper>
    </Center>
  );
}
