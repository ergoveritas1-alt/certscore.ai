export function formatInventoryNamePreview(name: string, maxCharacters = 10) {
  const characters = Array.from(name);
  return characters.length > maxCharacters
    ? `${characters.slice(0, maxCharacters).join("")}...`
    : name;
}

export function InventoryNameDisclosure({
  className = "",
  fullName,
}: {
  className?: string;
  fullName: string;
}) {
  const preview = formatInventoryNamePreview(fullName);
  if (preview === fullName) {
    return <span className={`font-mono ${className}`.trim()} title={fullName}>{fullName}</span>;
  }

  return (
    <details className={className}>
      <summary
        aria-label={`Show full retained name: ${fullName}`}
        className="w-fit cursor-pointer list-none font-mono text-sky-700 underline decoration-dotted underline-offset-2 marker:hidden hover:text-sky-900 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 [&::-webkit-details-marker]:hidden"
        title={`Show full name: ${fullName}`}
      >
        <span aria-hidden="true">{preview}</span>
      </summary>
      <div className="mt-1 whitespace-normal break-all rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] leading-4 text-slate-800">
        {fullName}
      </div>
    </details>
  );
}
