import { Anchor, Button, Checkbox, Container, Group, Modal, Paper, Stack, Table, Text, TextInput, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useState } from "react";

import { api, type Txn } from "../api";
import { Amount, LoadState, useAsync } from "../shared";

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

function TripPage({ trip, onBack }: { trip: Trip; onBack: () => void }) {
  const [reviewing, setReviewing] = useState(false);
  const [version, setVersion] = useState(0);
  const [rejected, setRejected] = useState<Set<number>>(new Set());
  const [unchecked, setUnchecked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const sugg = useAsync(() => api<Txn[]>(`/trips/${trip.id}/suggestions`), [trip.id, version]);
  const left = (sugg.data ?? []).filter((t) => !rejected.has(t.id));
  const current = left[0];
  const chosen = left.filter((t) => !unchecked.has(t.id));

  const add = async (items: Txn[]) => {
    setBusy(true);
    try {
      await Promise.all(items.map((t) => api(`/trips/${trip.id}/transactions`, { transaction_id: t.id })));
      setVersion((v) => v + 1);
    } catch (e) {
      notifications.show({ color: "red", title: "Add failed", message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const toggle = (id: number) =>
    setUnchecked((u) => {
      const n = new Set(u);
      if (!n.delete(id)) n.add(id);
      return n;
    });

  return (
    <Container size="xl" py="lg">
      <Anchor component="button" type="button" onClick={onBack} mb="sm">Back to trips</Anchor>
      <Title order={1} size="h2">{trip.name}</Title>
      <Text c="dimmed" mb="md">{day(trip.start_date)} – {day(trip.end_date)}</Text>
      {!reviewing && <Button onClick={() => setReviewing(true)}>Review suggestions</Button>}
      {reviewing && (
        <Stack>
          <LoadState loading={sugg.loading && !sugg.data} error={sugg.error} />
          {sugg.data && !current && <Text c="dimmed">No more suggestions</Text>}
          {current && (
            <Paper withBorder p="md" aria-label="Current suggestion">
              <Text c="dimmed" size="sm">{left.length} suggestions left</Text>
              <Title order={2} size="h4">{current.merchant}</Title>
              <Text>{current.date} · {current.category}</Text>
              <Text mb="sm"><Amount v={current.amount} /></Text>
              <Group>
                <Button loading={busy} onClick={() => add([current])}>Accept</Button>
                <Button variant="default" onClick={() => setRejected((r) => new Set(r).add(current.id))}>Reject</Button>
              </Group>
            </Paper>
          )}
          {left.length > 0 && (
            <>
              <Stack gap={4}>
                {left.map((t) => (
                  <Checkbox
                    key={t.id}
                    label={`${t.merchant} ${t.date}`}
                    checked={!unchecked.has(t.id)}
                    onChange={() => toggle(t.id)}
                  />
                ))}
              </Stack>
              <Group>
                <Button variant="light" loading={busy} disabled={!chosen.length} onClick={() => add(chosen)}>Accept all</Button>
              </Group>
            </>
          )}
        </Stack>
      )}
    </Container>
  );
}

export function Trips() {
  const [version, setVersion] = useState(0);
  const trips = useAsync(() => api<Trip[]>("/trips"), [version]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Trip | null>(null);

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
  if (open) return <TripPage trip={open} onBack={() => setOpen(null)} />;
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
                <Table.Td><Anchor component="button" type="button" onClick={() => setOpen(t)}>{t.name}</Anchor></Table.Td>
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
