import { Icon } from './Icon';

export function Brand({ small = false }: { small?: boolean }) {
  return <span className={small ? 'brand-mark sm' : 'brand-mark'}><Icon name="drop"/></span>;
}
