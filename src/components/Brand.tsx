export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "brand--compact" : ""}`}>
      <div className="brand__mark" aria-hidden="true">
        <span className="brand__card brand__card--back" />
        <span className="brand__card brand__card--front">
          <span className="brand__clock-hand" />
        </span>
      </div>
      <div>
        <strong>FokusDeck</strong>
        {!compact && <span>Lernen mit System</span>}
      </div>
    </div>
  );
}
