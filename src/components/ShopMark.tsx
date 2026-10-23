import { useConfig } from '../api/hooks';

/**
 * The shop's name, with its logo beside it when the shop has uploaded one. A shop without a logo is
 * shown by its name alone: the app never invents a mark for it.
 * Pass `name` and `logoUrl` where the shop's details come from elsewhere (the public status page).
 */
export function ShopMark({ size = 'md', name, logoUrl }: { size?: 'sm' | 'md' | 'lg'; name?: string; logoUrl?: string | null }) {
  const { data } = useConfig();
  const shopName = name ?? data?.shopName ?? '';
  const logo = logoUrl === undefined ? data?.logoUrl : logoUrl;
  return (
    <span className={`shopmark shopmark--${size}${logo ? '' : ' shopmark--text'}`}>
      {logo && <img className="shopmark__img" src={logo} alt="" />}
      <span className="shopmark__name">{shopName}</span>
    </span>
  );
}
