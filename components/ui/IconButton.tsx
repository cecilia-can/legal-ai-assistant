import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, CSSProperties } from "react";

import { Button } from "@/components/ui/Button";

type ButtonVariant = "primary" | "secondary";

/** 图标与按钮边缘的内边距（每侧 px），按钮总尺寸 = iconSize + 2 × 此值 */
const ICON_BUTTON_INSET_PX = 6;

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  /** 仅图标展示时使用，会写入 aria-label */
  label: string;
  variant?: ButtonVariant;
  /** Lucide size prop，写入 SVG 的 width/height（px） */
  iconSize?: number;
  /** 图标与按钮边缘间距（每侧 px），默认 4 */
  inset?: number;
  /** 手动指定按钮边长（px）；不设则 = iconSize + inset × 2 */
  buttonSize?: number;
  /** 仅用于颜色等样式，不要用 h-* w-* 控制尺寸 */
  iconClassName?: string;
}

export function IconButton({
  icon: Icon,
  label,
  variant = "secondary",
  iconSize = 20,
  inset = ICON_BUTTON_INSET_PX,
  buttonSize,
  iconClassName = "",
  className = "",
  style,
  ...props
}: IconButtonProps) {
  const edge = buttonSize ?? iconSize + inset * 2;
  const buttonStyle: CSSProperties = {
    width: edge,
    height: edge,
    ...style,
  };

  return (
    <Button
      variant={variant}
      size="icon"
      className={className}
      style={buttonStyle}
      aria-label={label}
      {...props}
    >
      <Icon
        size={iconSize}
        strokeWidth={2}
        className={iconClassName || undefined}
        aria-hidden
      />
    </Button>
  );
}
