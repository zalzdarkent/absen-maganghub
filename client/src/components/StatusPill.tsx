export type StatusKind = 'idle' | 'ok' | 'warn' | 'err';

const DOT_CLASS: Record<StatusKind, string> = {
  idle: 'dot',
  ok: 'dot ok',
  warn: 'dot warn',
  err: 'dot err',
};

export function StatusPill({ kind, text }: { kind: StatusKind; text: string }) {
  return (
    <div className="flex items-center gap-1.5 font-mono text-xs text-muted border border-border px-2.5 py-1.5 rounded-full max-[600px]:order-2">
      <span className={`${DOT_CLASS[kind]} w-[7px] h-[7px] rounded-full bg-muted shrink-0`} />
      <span>{text}</span>
    </div>
  );
}
