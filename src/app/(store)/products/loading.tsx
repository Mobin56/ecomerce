import { ProductGridSkeleton } from "@/components/store/product-card";

export default function Loading() {
  return (
    <div className="container-x pb-16 pt-6">
      <div className="skeleton mb-8 h-10 w-64" />
      <ProductGridSkeleton count={8} />
    </div>
  );
}
