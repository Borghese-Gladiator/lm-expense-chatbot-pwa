import { Button, Container, Group, Modal, Stack, Table, TextInput, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useState } from "react";

import { api } from "../api";
import { LoadState, useAsync } from "../shared";

interface Trip {
  id: number;
  name: string;
  start_date: string | null;
  end_date: string | null;
  link_count: number;
}
interface Draft {
  id?: number;
  name: string;
  start_date: string;
  end_date: string;
}

const day = (d: string | null) => (d ? d.slice(0, 10) : "");

export function Trips() {
  const [version, setVersion] = useState(0);
  const trips = useAsync(() => api<Trip[]>("/trips"), [version]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      setDraft(null);
      setVersion((v) => v + 1);
    } catch (e) {
      notifications.show({ color: "red", title: "Trip failed", message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!draft) return;
    const body = { name: draft.name.trim(), start_date: draft.start_date || null, end_date: draft.end_date || null };
    return run(() => (draft.id ? api(`/trips/${draft.id}`, body, "PATCH") : api("/trips", body)));
  };

  const list = trips.data ?? [];
  return (
    <Container size="xl" py="lg">
      <Group justify="space-between" mb="md">
        <Title order={1} size="h2">Trips</Title>
        <Button onClick={() => setDraft({ name: "", start_date: "", end_date: "" })}>New trip</Button>
      </Group>
      <LoadState loading={trips.loading && !trips.data} error={trips.error} empty={!trips.loading && !trips.error && list.length === 0} emptyText="No trips yet" />
      {list.length > 0 && (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Start</Table.Th>
              <Table.Th>End</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {list.map((t) => (
              <Table.Tr key={t.id}>
                <Table.Td>{t.name}</Table.Td>
                <Table.Td>{day(t.start_date)}</Table.Td>
                <Table.Td>{day(t.end_date)}</Table.Td>
                <Table.Td>
                  <Group gap="xs" justify="flex-end">
                    <Button
                      size="xs"
                      variant="default"
                      aria-label={`Edit ${t.name}`}
                      onClick={() => setDraft({ id: t.id, name: t.name, start_date: day(t.start_date), end_date: day(t.end_date) })}
                    >
                      Edit
                    </Button>
                    <Button
                      size="xs"
                      color="red"
                      variant="light"
                      aria-label={`Delete ${t.name}`}
                      onClick={() => {
                        if (!confirm(`Delete ${t.name}?`)) return;
                        void run(() => api(`/trips/${t.id}`, undefined, "DELETE"));
                      }}
                    >
                      Delete
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      <Modal opened={!!draft} onClose={() => setDraft(null)} title={draft?.id ? "Edit trip" : "New trip"}>
        {draft && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <Stack>
              <TextInput label="Name" required data-autofocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.currentTarget.value })} />
              <TextInput label="Start date" type="date" value={draft.start_date} onChange={(e) => setDraft({ ...draft, start_date: e.currentTarget.value })} />
              <TextInput label="End date" type="date" value={draft.end_date} min={draft.start_date || undefined} onChange={(e) => setDraft({ ...draft, end_date: e.currentTarget.value })} />
              <Button type="submit" loading={busy} disabled={!draft.name.trim()}>Save trip</Button>
            </Stack>
          </form>
        )}
      </Modal>
    </Container>
  );
}
