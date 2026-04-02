interface StepBadgeProps {
  step: number
  label: string
  status: 'completed' | 'active' | 'pending'
}

export default function StepBadge({ step, label, status }: StepBadgeProps) {
  const containerStyles = {
    completed: 'bg-[#0A2540] text-white',
    active: 'bg-[#009AE0] text-white',
    pending: 'bg-[#D0E3F0] text-[#64748B]',
  }

  const numberStyles = {
    completed: 'bg-white/20 text-white',
    active: 'bg-white/20 text-white',
    pending: 'bg-white text-[#64748B]',
  }

  return (
    <div
      className={`
        inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold
        ${containerStyles[status]}
      `}
    >
      <span
        className={`
          w-5 h-5 rounded-full flex items-center justify-center text-xs font-mono font-medium
          ${numberStyles[status]}
        `}
      >
        {status === 'completed' ? '✓' : step}
      </span>
      <span className="text-xs">{label}</span>
    </div>
  )
}
