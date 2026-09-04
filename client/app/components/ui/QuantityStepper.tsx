"use client";

import React from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface QuantityStepperProps {
  value: number;
  min?: number;
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  className?: string;
}

export const QuantityStepper: React.FC<QuantityStepperProps> = ({
  value,
  min = 1,
  max,
  onChange,
  disabled = false,
  className,
}) => {
  const effectiveMax = Math.max(min, max);
  const [inputValue, setInputValue] = React.useState<string>(String(value));

  // Sync internal input string when external value changes
  React.useEffect(() => {
    setInputValue(String(value));
  }, [value]);

  const handleDecrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled || value <= min) return;
    const next = Math.max(min, value - 1);
    onChange(next);
  };

  const handleIncrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled || value >= effectiveMax) return;
    const next = Math.min(effectiveMax, value + 1);
    onChange(next);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setInputValue(raw);

    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed)) {
      if (parsed >= min && parsed <= effectiveMax) {
        onChange(parsed);
      }
    }
  };

  const handleBlur = () => {
    const parsed = parseInt(inputValue, 10);
    if (isNaN(parsed) || parsed < min) {
      setInputValue(String(min));
      onChange(min);
    } else if (parsed > effectiveMax) {
      setInputValue(String(effectiveMax));
      onChange(effectiveMax);
    } else {
      setInputValue(String(parsed));
      onChange(parsed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleBlur();
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <div
      className={cn(
        "inline-flex h-[28px] items-center rounded-lg border border-gray-300 bg-white shadow-sm transition-colors focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20",
        disabled && "opacity-50 cursor-not-allowed",
        className,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Decrement Button */}
      <button
        type="button"
        onClick={handleDecrement}
        disabled={disabled || value <= min}
        className="flex h-full w-[24px] items-center justify-center rounded-l-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent"
        aria-label="Decrease quantity"
      >
        <Minus className="h-3 w-3 stroke-[2.5]" />
      </button>

      {/* Number Input */}
      <input
        type="number"
        min={min}
        max={effectiveMax}
        value={inputValue}
        onChange={handleInputChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className="h-full w-[36px] border-x border-gray-200 bg-transparent px-0.5 text-center font-ddin text-[13px] font-bold text-gray-800 outline-none [appearance:textfield] focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />

      {/* Increment Button */}
      <button
        type="button"
        onClick={handleIncrement}
        disabled={disabled || value >= effectiveMax}
        className="flex h-full w-[24px] items-center justify-center rounded-r-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent"
        aria-label="Increase quantity"
      >
        <Plus className="h-3 w-3 stroke-[2.5]" />
      </button>
    </div>
  );
};

export default QuantityStepper;
