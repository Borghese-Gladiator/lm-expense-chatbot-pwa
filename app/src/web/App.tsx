import { AppShell, Badge, Burger, Button, Container, Group, NavLink, Paper, Text, Title } from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { useCallback, useEffect, useState } from "react";

import type { Drill } from "./api";
import { setCurrency } from "./format";
import { Accounts } from "./pages/Accounts";
import { Explore } from "./pages/Explore";
import { Overview } from "./pages/Overview";
import { Settings } from "./pages/Settings";
import { Transactions } from "./pages/Transactions";
import { Ctx, DrilldownDrawer, useMeta } from "./shared";
import { TxnDetail } from "./TxnDetail";

const PAGES = {
  overview: { label: "Overview", el: Overview },
  explore: { label: "Explore", el: Explore },
  transactions: { label: "Transactions", el: Transactions },
  accounts: { label: "Accounts", el: Accounts },
  settings: { label: "Settings", el: Settings },
} as const;
type PageId = keyof typeof PAGES;

const pageFromHash = (): PageId => {
  const id = location.hash.slice(1).split("?")[0] as PageId;
  return id in PAGES ? id : "overview";
};

export default function App() {
  const { meta, reloadMeta } = useMeta();
  const [page, setPage] = useState<PageId>(pageFromHash);
  const [drill, setDrill] = useState<Drill | null>(null);
  const [txnId, setTxnId] = useState<number | null>(null);
  const [version, setVersion] = useState(0);
  const [opened, { toggle, close }] = useDisclosure();
  const mobile = useMediaQuery("(max-width: 47.99em)");
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const closeDrill = useCallback(() => setDrill(null), []);

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

  const Page = PAGES[page].el;
  const empty = meta && meta.accounts.length === 0 && page !== "accounts" && page !== "settings";

  return (
    <Ctx.Provider value={{ meta, reloadMeta, openDrill: setDrill, openTxn: setTxnId, version, bump }}>
      <AppShell header={{ height: 48 }} navbar={{ width: 220, breakpoint: "sm", collapsed: { mobile: !opened } }} padding={0}>
        <AppShell.Header>
          <Group h="100%" px="md" gap="sm">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="Toggle navigation" />
            <Group gap={8} wrap="nowrap">
              <Badge radius="sm" aria-hidden="true">SL</Badge>
              <Text fw={700}>Spend Lens</Text>
            </Group>
          </Group>
        </AppShell.Header>
        <AppShell.Navbar p="xs" style={mobile && !opened ? { visibility: "hidden" } : undefined}>
          {(Object.keys(PAGES) as PageId[]).map((id) => (
            <NavLink
              key={id}
              href={`#${id}`}
              label={PAGES[id].label}
              active={page === id}
              aria-current={page === id ? "page" : undefined}
              onClick={close}
            />
          ))}
        </AppShell.Navbar>
        <AppShell.Main>
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
