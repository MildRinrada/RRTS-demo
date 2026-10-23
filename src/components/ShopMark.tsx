import { useConfig } from '../api/hooks';

/** The shop's mark: its uploaded logo, or a monogram from the first letter of its name in the shop's raspberry. */
export function ShopMark({ size = 'md', withName = true }: { size?: 'sm' | 'md' | 'lg'; withName?: boolean }) {
  const { data } = useConfig();
  const name = data?.shopName ?? '';
  const letter = Array.from(name.replace(/^ร้าน\s*/, ''))[0] ?? '';
  return (
    <span className={`shopmark shopmark--${size}`}>
      {data?.logoUrl ? (
        <img className="shopmark__img" src={data.logoUrl} alt="" />
      ) : (
        <span className="shopmark__mono" aria-hidden="true">
          {letter}
        </span>
      )}
      {withName && <span className="shopmark__name">{name}</span>}
    </span>
  );
}
