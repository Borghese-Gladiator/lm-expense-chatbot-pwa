import { Button, Group, Paper, Stack, Table, Text, TextInput, Title } from "@mantine/core";
import { useCallback, useEffect, useState } from "react";

import { api } from "../api";
import { money } from "../format";

interface Trip {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  linked_total: number;
  txn_count: number;
}

export function Trips() {
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(() => api<Trip[]>("/trips").then(setTrips), []);
  useEffect(() => {
    void load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api("/trips", { name, start_date: start, end_date: end });
      setName("");
      setStart("");
      setEnd("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add trip");
    }
  }

  return (
    <Stack p="md" maw={900}>
      <Title order={2} size="h3">Trips</Title>
      <Paper withBorder p="md">
        <form onSubmit={add}>
          <Group align="flex-end">
            <TextInput label="Name" required value={name} onChange={(e) => setName(e.currentTarget.value)} />
            <TextInput label="Start date" type="date" required value={start} onChange={(e) => setStart(e.currentTarget.value)} />
            <TextInput label="End date" type="date" required value={end} onChange={(e) => setEnd(e.currentTarget.value)} />
            <Button type="submit">New trip</Button>
          </Group>
          {error && <Text c="red" mt="xs" role="alert">{error}</Text>}
        </form>
      </Paper>
      {trips && trips.length === 0 && <Text c="dimmed">No trips yet.</Text>}
      {trips && trips.length > 0 && (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Trip</Table.Th>
              <Table.Th>Dates</Table.Th>
              <Table.Th>Transactions</Table.Th>
              <Table.Th>Linked total</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {trips.map((t) => (
              <Table.Tr key={t.id}>
                <Table.Td>{t.name}</Table.Td>
                <Table.Td>{t.start_date} – {t.end_date}</Table.Td>
                <Table.Td>{t.txn_count}</Table.Td>
                <Table.Td>{money(t.linked_total)}</Table.Td>
                <Table.Td>
                  <Button size="xs" color="red" variant="light" aria-label={`Delete ${t.name}`} onClick={async () => {
                    await api(`/trips/${t.id}`, undefined, "DELETE");
                    await load();
                  }}>Delete</Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
