import * as React from "react";
import { cn } from "@/lib/utils";
import DeleteIcon from "@/app/components/icons/DeleteIcon";

interface InputProps extends React.ComponentProps<"input"> {
  clearable?: boolean;
  forceShowClear?: boolean;
  onClear?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type,
      value,
      onChange,
      clearable = true,
      forceShowClear = false,
      onClear,
      ...props
    },
    ref,
  ) => {
    const handleClear = (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (onClear) {
        onClear(e);
      } else if (onChange) {
        const clearedValue = "";
        const event = {
          target: { value: clearedValue },
        } as React.ChangeEvent<HTMLInputElement>;
        onChange(event);
      }
    };

    const hasValue =
      value !== undefined && value !== null && String(value).length > 0;
    const showClear = clearable && (forceShowClear || hasValue);

    return (
      <div className={cn("relative w-full", className)}>
        <input
          type={type}
          value={value}
          onChange={onChange}
          ref={ref}
          className={cn(
            "type-body-t2 flex h-[34px] w-full rounded-full border border-primary-30 bg-white px-3 py-1 font-ddin text-lg text-primary-75 transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:leading-[34px] placeholder:text-primary-75 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
            showClear ? "pr-8" : "pr-3",
            className,
          )}
          {...props}
        />

        {showClear && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-4 top-1/2 -translate-y-1/2 hover:text-gray-600"
          >
            <DeleteIcon />
          </button>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";

export { Input };
