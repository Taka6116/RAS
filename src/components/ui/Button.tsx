'use client'

import { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonVariant = 'primary' | 'ghost' | 'navy'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
  loading?: boolean
}

const sizeStyles = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
}

const variantInlineStyle: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: 'linear-gradient(135deg, #0056A0 0%, #009AE0 60%, #33C0F0 100%)',
    border: 'none',
    color: '#fff',
    boxShadow: '0 2px 12px rgba(0,154,224,0.35), inset 0 1px 0 rgba(255,255,255,0.25)',
  },
  ghost: {
    background: 'transparent',
    border: '1px solid #D0E3F0',
    color: '#0A2540',
  },
  navy: {
    background: 'linear-gradient(135deg, #0A1628 0%, #0A2540 60%, #0056A0 100%)',
    border: 'none',
    color: '#fff',
    boxShadow: '0 2px 12px rgba(10,37,64,0.35), inset 0 1px 0 rgba(255,255,255,0.12)',
  },
}

export default function Button({
  variant = 'primary',
  size = 'md',
  children,
  loading = false,
  disabled,
  className = '',
  style,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading

  return (
    <button
      {...props}
      disabled={isDisabled}
      className={`
        inline-flex items-center justify-center gap-2
        font-semibold rounded-lg
        transition-all duration-150
        cursor-pointer select-none
        ${sizeStyles[size]}
        ${isDisabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : 'hover:brightness-110 hover:scale-[1.02] active:scale-[0.98]'}
        ${className}
      `}
      style={{ ...variantInlineStyle[variant], ...style }}
    >
      {loading && (
        <svg
          className="animate-spin h-4 w-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      {children}
    </button>
  )
}
