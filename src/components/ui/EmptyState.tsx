import React from 'react'

interface Props {
  icon?: React.ComponentType<{ size?: number; className?: string }>
  children: React.ReactNode
}

export default function EmptyState({ icon: Icon, children }: Props) {
  return (
    <div
      className="rounded-xl p-8 border text-center bg-surface border-border"
    >
      {Icon && <Icon size={40} className="mx-auto mb-3 text-text-faint" />}
      <p className="text-text-muted">{children}</p>
    </div>
  )
}
