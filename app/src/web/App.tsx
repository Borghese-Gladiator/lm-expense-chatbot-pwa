import { Alert, AppShell, Badge, Box, Burger, Button, Container, Group, NavLink, Paper, Text, Title } from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { useCallback, useEffect, useState } from "react";

import { api, type Drill } from "./api";
import { setCurrency } from "./format";
import { Accounts } from "./pages/Accounts";
import { Explore } from "./pages/Explore";
import { Overview } from "./pages/Overview";
import { Settings } from "./pages/Settings";
import { Transactions } from "./pages/Transactions";
import { Trips } from "./pages/Trips";
import { Ctx, DrilldownDrawer, useMeta } from "./shared";
import { TxnDetail } from "./TxnDetail";

const PAGES = {
  overview: { label: "Overview", el: Overview },
  explore: { label: "Explore", el: Explore },
  transactions: { label: "Transactions", el: Transactions },
  trips: { label: "Trips", el: Trips },
  accounts: { label: "Accounts", el: Accounts },
  settings: { label: "Settings", el: Settings },
} as const;
type PageId = keyof typeof PAGES;

const pageFromHash = (): PageId => {
  const id = location.hash.slice(1).split("?")[0] as PageId;
  return id in PAGES ? id : "overview";
};

async function signOut() {
  await fetch("/api/logout", { method: "POST" });
  location.href = "/login";
}

export default function App() {
  const { meta, reloadMeta } = useMeta();
  const txnCount = meta?.accounts.reduce((n, a) => n + a.txn_count, 0);
  const [page, setPage] = useState<PageId>(pageFromHash);
  const [drill, setDrill] = useState<Drill | null>(null);
  const [txnId, setTxnId] = useState<number | null>(null);
  const [version, setVersion] = useState(0);
  const [opened, { toggle, close }] = useDisclosure();
  const mobile = useMediaQuery("(max-width: 47.99em)");
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const closeDrill = useCallback(() => setDrill(null), []);
  const [broken, setBroken] = useState<string[]>([]);

  useEffect(() => {
    const on = () => {
      const next = pageFromHash();
      setPage((prev) => {
        if (prev !== next) {
          setDrill(null);
          setTxnId(null);
        }
        return next;
      });
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  useEffect(() => {
    if (meta) setCurrency(meta.currency);
  }, [meta]);
  useEffect(() => {
    if (version) reloadMeta();
  }, [version, reloadMeta]);
  useEffect(() => {
    api<{ institution: string | null; status: string }[]>("/plaid/items")
      .then((rows) => setBroken(rows.filter((r) => r.status !== "ok").map((r) => r.institution ?? "Bank")))
      .catch(() => setBroken([]));
  }, [version, page]);

  const Page = PAGES[page].el;
  const empty = meta && meta.accounts.length === 0 && page !== "accounts" && page !== "settings" && page !== "trips";

  return (
    <Ctx.Provider value={{ meta, reloadMeta, openDrill: setDrill, openTxn: setTxnId, version, bump }}>
      <AppShell header={{ height: 48 }} navbar={{ width: 220, breakpoint: "sm", collapsed: { mobile: !opened } }} padding={0}>
        <AppShell.Header>
          <Group h="100%" px="md" gap="sm">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="Toggle navigation" />
            <Group component="nav" aria-label="Breadcrumb" gap={6} wrap="nowrap">
              <Text size="sm" c="dimmed">Workspace</Text>
              <Text size="sm" c="dimmed" aria-hidden="true">/</Text>
              <Text size="sm" fw={600} aria-current="page">{PAGES[page].label}</Text>
            </Group>
            <Button variant="subtle" size="xs" ml="auto" onClick={signOut}>Sign out</Button>
          </Group>
        </AppShell.Header>
        <AppShell.Navbar p="xs" style={mobile && !opened ? { visibility: "hidden" } : undefined}>
          <Group gap={8} wrap="nowrap" px="xs" pb="sm">
            <Badge radius="sm" aria-hidden="true">SL</Badge>
            <div>
              <Text fw={700} lh={1.2}>Spend Lens</Text>
              <Text size="xs" c="dimmed">Personal spending</Text>
            </div>
          </Group>
          {(Object.keys(PAGES) as PageId[]).map((id) => (
            <NavLink
              key={id}
              href={`#${id}`}
              label={PAGES[id].label}
              active={page === id}
              aria-current={page === id ? "page" : undefined}
              onClick={close}
              rightSection={
                id === "transactions" && txnCount ? (
                  <Badge variant="light" size="sm" aria-hidden="true">{txnCount.toLocaleString()}</Badge>
                ) : id === "accounts" && broken.length > 0 ? (
                  <Box aria-hidden="true" w={8} h={8} bg="red" style={{ borderRadius: "50%" }} />
                ) : undefined
              }
            />
          ))}
          <Text size="xs" c="dimmed" px="xs" mt="auto">Signed in with the shared password</Text>
        </AppShell.Navbar>
        <AppShell.Main>
          {broken.length > 0 && page !== "accounts" && (
            <Alert color="red" role="alert" radius={0} title="A bank connection needs attention">
              <Group gap="sm" wrap="wrap">
                <Text size="sm">{broken.join(", ")} needs a new sign-in. New transactions are not syncing.</Text>
                <Button component="a" href="#accounts" size="xs" color="red">Open Accounts</Button>
              </Group>
            </Alert>
          )}
          {empty ? (
            <Container size="xl" py="lg">
              <Paper withBorder p="xl" ta="center">
                <Title order={2} size="h4" mb="sm">No data yet</Title>
                <Text c="dimmed" mb="md">Connect a bank or import a CSV file (for example, your Lunch Money export) on the Accounts page.</Text>
                <Button component="a" href="#accounts">Go to Accounts</Button>
              </Paper>
            </Container>
          ) : (
            <Page key={page} />
          )}
        </AppShell.Main>
      </AppShell>
      {drill && !txnId && <DrilldownDrawer drill={drill} onClose={closeDrill} />}
      {txnId && <TxnDetail id={txnId} onClose={() => setTxnId(null)} />}
    </Ctx.Provider>
  );
}
