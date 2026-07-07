"use client";

import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

type SpinnerSize = "xs" | "sm" | "md";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  loadingLabel?: ReactNode;
  spinnerSize?: SpinnerSize;
  showSpinner?: boolean;
};

export const AsyncButton = forwardRef<HTMLButtonElement, Props>(function AsyncButton(
  {
    loading = false,
    loadingLabel,
    spinnerSize = "sm",
    showSpinner = true,
    disabled,
    children,
    className = "",
    type = "button",
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;
  const label = loading && loadingLabel != null ? loadingLabel : children;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={[
        className,
        loading ? "cursor-wait" : "",
        isDisabled && !loading ? "disabled:cursor-not-allowed disabled:opacity-60" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {loading && showSpinner ? (
        <span className="inline-flex items-center justify-center gap-2">
          <LoadingSpinner size={spinnerSize} />
          {label}
        </span>
      ) : (
        label
      )}
    </button>
  );
});
