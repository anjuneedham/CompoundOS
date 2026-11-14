import { PageHeader, Section, Badge } from "@/components/ui";

const BROKERS = [
  { name: "Mock broker (paper)", status: "connected", tone: "good" as const, note: "Built-in simulated broker with fault injection. Used for all paper trading and automated tests." },
  { name: "Deriv", status: "not integrated", tone: "dim" as const, note: "Pending account-type confirmation. Deriv options/multipliers use the Deriv WebSocket API; Deriv MT5 accounts are a different product and are not accessible through that API in the same way. See BROKER_INTEGRATIONS.md." },
  { name: "Pepperstone (cTrader Open API)", status: "not integrated", tone: "dim" as const, note: "Requires a cTrader account and a registered Open API application (OAuth). MT4/MT5 accounts have no first-party REST API. See BROKER_INTEGRATIONS.md." },
];

export default function Brokers() {
  return (
    <>
      <PageHeader title="Broker connections" subtitle="All brokers implement one adapter interface. Real integrations are added only after verifying account type and API access." />
      <div className="grid gap-4 md:grid-cols-3">{BROKERS.map((b) => <Section key={b.name} title={b.name} right={<Badge tone={b.tone}>{b.status}</Badge>}><p className="text-sm text-dim">{b.note}</p></Section>)}</div>
      <div className="mt-4"><Section title="Credential handling"><p className="text-sm text-dim">Broker credentials are never entered in this UI or stored in application tables. When a real integration is added, tokens will be stored in Supabase Vault (server-side secrets) and referenced by id only. Claude never receives broker credentials.</p></Section></div>
    </>
  );
}
