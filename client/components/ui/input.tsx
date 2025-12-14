import * as React from "react";
import { cn } from "@/lib/utils";
import DeleteIcon from "@/app/components/icons/DeleteIcon";

interface InputProps extends React.ComponentProps<"input"> {
  clearable?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, value, onChange, clearable = true, ...props }, ref) => {
    const handleClear = (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (!onChange) return;
      const clearedValue = type === "number" ? 1 : "";
      if (onChange) {
        const event = {
          target: { value: clearedValue },
        } as React.ChangeEvent<HTMLInputElement>;
        onChange(event);
      }
    };

    return (
      <div className={cn("relative w-full", className)}>
        <input
          type={type}
          value={value}
          onChange={onChange}
          ref={ref}
          className={cn(
            "flex h-[34px] w-full rounded-full border font-ddin border-primary-30 bg-white px-3 py-1 text-primary-75 transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm placeholder:text-megaweave-forest-dark type-body-t2 placeholder:leading-[34px]",
            clearable && value ? "pr-3" : "pr-3", // pr-8 為清除按鈕預留空間
            className
          )}
          {...props}
        />

        {clearable && value && String(value).length > 0 && (
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
  }
);

Input.displayName = "Input";

export { Input };
