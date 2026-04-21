'use client'

import type { ReactNode } from 'react'

export function FormField({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-semibold text-[#0A2540] mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-[#64748B] mt-1">{hint}</p>}
    </div>
  )
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="text"
      {...props}
      className={
        (props.className || '') +
        ' w-full px-3 py-2 text-sm border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#009AE0]'
      }
    />
  )
}

export function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={/^#([0-9a-fA-F]{6})$/.test(value) ? value : '#000000'}
        onChange={e => onChange(e.target.value)}
        className="w-11 h-10 rounded-md border border-[#CBD5E1] cursor-pointer p-0"
      />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="flex-1 px-3 py-2 text-sm font-mono border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#009AE0]"
        placeholder="#009AE0"
      />
    </div>
  )
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={
        (props.className || '') +
        ' w-full px-3 py-2 text-sm border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#009AE0] font-mono'
      }
    />
  )
}

export function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-5 pb-3 border-b border-[#E2E8F0]">
      <h2 className="text-lg font-bold text-[#0A2540]">{title}</h2>
      {description && <p className="text-xs text-[#64748B] mt-1">{description}</p>}
    </div>
  )
}
