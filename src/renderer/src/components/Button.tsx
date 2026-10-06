import type { ButtonHTMLAttributes } from 'react';
import { Icon } from './Icon';

type Variant = 'primary' | 'soft' | 'ghost';

export function Button({ variant = 'soft', className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type="button" className={`btn btn--${variant} ${className}`} {...rest} />;
}

export function IconButton({ label, icon, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon: string }) {
  return (
    <button type="button" className={`icon-btn ${className}`} aria-label={label} title={label} {...rest}>
      <Icon name={icon} size={16} />
    </button>
  );
}
