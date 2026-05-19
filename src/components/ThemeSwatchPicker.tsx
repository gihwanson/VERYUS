import React from 'react';
import { Check } from 'lucide-react';
import './ThemeSwatchPicker.css';

export interface ThemeSwatchOption {
  id: string;
  label: string;
  preview: string;
}

interface ThemeSwatchPickerProps {
  options: ThemeSwatchOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  description: string;
  ariaLabel: string;
  compact?: boolean;
}

const ThemeSwatchPicker: React.FC<ThemeSwatchPickerProps> = ({
  options,
  selectedId,
  onSelect,
  description,
  ariaLabel,
  compact = false,
}) => (
  <div className={`theme-swatch-picker${compact ? ' theme-swatch-picker--compact' : ''}`}>
    <p className="theme-swatch-picker__desc">{description}</p>
    <div className="theme-swatch-picker__grid" role="listbox" aria-label={ariaLabel}>
      {options.map((option) => {
        const isSelected = selectedId === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="option"
            aria-selected={isSelected}
            className={`theme-swatch-picker__swatch${isSelected ? ' is-selected' : ''}`}
            onClick={() => onSelect(option.id)}
            title={option.label}
          >
            <span
              className="theme-swatch-picker__color"
              style={{ background: option.preview }}
              aria-hidden
            />
            <span className="theme-swatch-picker__label">{option.label}</span>
            {isSelected && (
              <span className="theme-swatch-picker__check" aria-hidden>
                <Check size={14} strokeWidth={3} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  </div>
);

export default ThemeSwatchPicker;
