import React, { useState } from 'react';
import { ChevronDownIcon } from '../icons.js';

export interface PanelProps {
  title?: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

export function Panel({
  title,
  collapsible = false,
  defaultCollapsed = false,
  className,
  style,
  children,
}: PanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div className={`pc-panel ${className ?? ''}`} style={style}>
      {title && (
        <div className="pc-panel-header">
          <span>{title}</span>
          {collapsible && (
            <button
              className={`pc-icon-button pc-panel-toggle ${collapsed ? 'pc-panel-toggle--collapsed' : ''}`}
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? 'Expand' : 'Collapse'}
            >
              <ChevronDownIcon size={14} />
            </button>
          )}
        </div>
      )}
      <div className={`pc-panel-body ${collapsed ? 'pc-panel-body--collapsed' : ''}`}>
        {children}
      </div>
    </div>
  );
}
