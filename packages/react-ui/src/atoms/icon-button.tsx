import React from 'react';
import { iconMap } from '../icons.js';
import type { IconName } from '../icons.js';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label?: string;
  size?: number;
}

export function IconButton({
  icon,
  label,
  size = 16,
  className,
  ...props
}: IconButtonProps) {
  const IconComponent = iconMap[icon];
  return (
    <button
      className={`pc-icon-button ${className ?? ''}`}
      aria-label={label}
      {...props}
    >
      {IconComponent ? <IconComponent size={size} /> : null}
    </button>
  );
}
