import { useEffect, useState } from "react";
import { Package, Plus, Refrigerator, Snowflake, Star } from "lucide-react";
import { Badge, Button, Card, CardContent, CardFooter, CardHeader } from "@retail/common";
import { fetchVaultDownloadUrl, productUnitPrice, type Product } from "../../lib/api";
import {
  formatScaledMoney,
  formatScaledQuantity,
  isWeightedUnit,
  toScaled,
  unitLabel,
} from "../../lib/quantity";
import { useCartStore } from "../../store/cart.store";
import type { PosColumnCount } from "./PosHeader";

const COLUMN_CLASSES: Record<PosColumnCount, string> = {
  2: "grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4",
  6: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6",
};

interface CatalogGridProps {
  products: Product[];
  columns: PosColumnCount;
  onAdd: (product: Product) => void;
}

function storageLabel(product: Product): string | null {
  if (product.storage_type === "REFRIGERATED") return "Refrigerado";
  if (product.storage_type === "FROZEN") return "Congelado";
  return null;
}

export default function CatalogGrid({ products, columns, onAdd }: CatalogGridProps) {
  const items = useCartStore((state) => state.items);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    for (const product of products) {
      if (!product.image_file_id) continue;
      const key = product.id ?? product.sku ?? product.name ?? "";
      if (!key || imageUrls[key]) continue;
      fetchVaultDownloadUrl(product.image_file_id)
        .then((url) => {
          if (!cancelled) setImageUrls((current) => ({ ...current, [key]: url }));
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [products, imageUrls]);

  if (products.length === 0) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
        <Package className="h-8 w-8" aria-hidden="true" />
        <p className="text-sm font-medium">No se encontraron productos.</p>
        <p className="text-xs">Prueba con otro nombre, SKU o código de barras.</p>
      </div>
    );
  }

  return (
    <ul className={`grid gap-3 ${COLUMN_CLASSES[columns]}`} aria-label="Catálogo de productos">
      {products.map((product, index) => {
        const sku = product.sku ?? "";
        const key = product.id ?? sku ?? product.name ?? String(index);
        const label = unitLabel(product.unit_of_measure);
        const weighted = product.is_weighable ?? isWeightedUnit(product.unit_of_measure);
        const hasStock =
          typeof product.stock_quantity === "number" || typeof product.stock === "number";
        const stockScaled =
          product.stock_quantity ??
          (typeof product.stock === "number" ? toScaled(product.stock) : 0);
        const outOfStock = hasStock && stockScaled <= 0;
        const inCart = items.find((item) => item.sku === sku);
        const imageUrl = product.image_file_id ? imageUrls[key] : undefined;
        const storage = storageLabel(product);

        return (
          <li key={`${sku || "product"}-${index}`}>
            <Card className="flex h-full flex-col">
              <CardHeader className="p-3 pb-1.5">
                <span className="relative mb-2 flex h-24 w-full items-center justify-center overflow-hidden rounded-xl bg-muted">
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt={product.name ?? "Producto"}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Package className="h-9 w-9 text-muted-foreground" aria-hidden="true" />
                  )}
                  {product.is_favorite && (
                    <Badge
                      variant="accent"
                      className="absolute top-1 right-1 shrink-0 text-[10px]"
                    >
                      <Star className="h-3 w-3" aria-hidden="true" />
                      Favorito
                    </Badge>
                  )}
                </span>
                <div className="flex items-start justify-between gap-2">
                  <span className="line-clamp-2 text-sm leading-tight font-semibold">
                    {product.name ?? "Producto"}
                  </span>
                  {hasStock &&
                    (outOfStock ? (
                      <Badge variant="destructive" className="shrink-0 text-[10px]">
                        Agotado
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
                        {formatScaledQuantity(stockScaled)} {label}
                      </Badge>
                    ))}
                </div>
                <span className="font-mono text-xs text-muted-foreground">{sku || "—"}</span>
                {product.category_name && (
                  <span className="text-[11px] text-muted-foreground">{product.category_name}</span>
                )}
                {(storage || product.is_perishable) && (
                  <span className="mt-1 flex flex-wrap gap-1">
                    {storage && (
                      <Badge variant="secondary" className="text-[10px]">
                        {storage === "Congelado" ? (
                          <Snowflake className="h-3 w-3" aria-hidden="true" />
                        ) : (
                          <Refrigerator className="h-3 w-3" aria-hidden="true" />
                        )}
                        {storage}
                      </Badge>
                    )}
                    {product.is_perishable && (
                      <Badge variant="amber" className="text-[10px]">
                        Perecedero
                      </Badge>
                    )}
                  </span>
                )}
              </CardHeader>
              <CardContent className="flex-1 p-3 pt-0">
                <span className="text-lg font-bold text-accent-brand">
                  {formatScaledMoney(productUnitPrice(product))}
                </span>
                <span className="ml-1 text-[11px] text-muted-foreground">
                  / {weighted ? "peso" : "unidad"}
                </span>
                {inCart && (
                  <p className="mt-1 text-[11px] font-medium text-muted-foreground">
                    En carrito: {formatScaledQuantity(inCart.quantity)} {label}
                  </p>
                )}
              </CardContent>
              <CardFooter className="p-3 pt-0">
                <Button
                  size="sm"
                  variant={outOfStock ? "outline" : "accent"}
                  className="w-full"
                  disabled={outOfStock}
                  onClick={() => onAdd(product)}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  {outOfStock ? "Agotado" : "Agregar"}
                </Button>
              </CardFooter>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
