export default function Loading() {
  return (
    <div className="container-x grid gap-8 pt-8 lg:grid-cols-[1.1fr_1fr] lg:gap-14" aria-busy aria-label="Loading product">
      <div className="skeleton aspect-square rounded-3xl" />
      <div className="space-y-4">
        <div className="skeleton h-4 w-24" />
        <div className="skeleton h-9 w-4/5" />
        <div className="skeleton h-8 w-40" />
        <div className="skeleton h-24 w-full" />
        <div className="skeleton h-12 w-full rounded-full" />
      </div>
    </div>
  );
}
