/**
 * A person's stable initial on a pale tint of their own hue, so each technician is recognised on the
 * board at a glance. Hues sit far apart and stay pale: identity, not data.
 */
const HUES = [205, 150, 35, 330, 95, 15, 180, 260];

export function Person({ id, name, withName = false }: { id: number | null; name: string; withName?: boolean }) {
  const hue = id === null ? null : HUES[id % HUES.length];
  const initial = Array.from(name.replace(/^(ช่าง|คุณ)\s*/, ''))[0] ?? '?';
  return (
    <span className="person" title={name}>
      <span className="person__dot" style={hue === null ? undefined : { background: `hsl(${hue} 70% 92%)`, color: `hsl(${hue} 55% 26%)` }} aria-hidden="true">
        {id === null ? '-' : initial}
      </span>
      {withName ? <span className="person__name">{name}</span> : <span className="visually-hidden">{name}</span>}
    </span>
  );
}
