import type { TabName } from '../types';

const TABS: { key: TabName; label: string }[] = [
  { key: 'generate', label: 'generate' },
  { key: 'history', label: 'riwayat' },
  { key: 'settings', label: 'pengaturan' },
];

export function Tabs({ active, onChange }: { active: TabName; onChange: (t: TabName) => void }) {
  return (
    <nav className="flex gap-1 ml-auto max-[600px]:ml-0 max-[600px]:w-full max-[600px]:order-3">
      {TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          className={`tab font-mono text-[13px] border border-transparent text-muted px-3.5 py-[7px] rounded-md cursor-pointer hover:text-text hover:border-border transition ${
            active === t.key ? 'active' : ''
          }`}
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
