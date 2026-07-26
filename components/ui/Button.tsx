import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** icon 按钮：仅去掉默认 padding，具体宽高由 IconButton 按图标尺寸计算 */
  size?: "default" | "icon";
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-primary-foreground hover:opacity-90 border border-transparent",
  secondary:
    "bg-surface text-foreground border border-border hover:bg-background",
};

export function Button({
  variant = "primary",
  size = "default",
  className = "",
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  const sizeClasses = size === "icon" ? "shrink-0 p-0" : "px-4 py-2";

  return (
    <button
      type={type}
      disabled={disabled}
      className={`inline-flex items-center justify-center rounded-lg text-sm font-medium transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 ${sizeClasses} ${variantClasses[variant]} ${className}`}
      {...props}
    />
  );
}
