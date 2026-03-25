export default function EmptyState({ icon: Icon, children }) {
  return (
    <div
      className="rounded-xl p-8 border text-center"
      style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
    >
      {Icon && <Icon size={40} className="mx-auto mb-3 text-slate-600" />}
      <p className="text-slate-400">{children}</p>
    </div>
  )
}
