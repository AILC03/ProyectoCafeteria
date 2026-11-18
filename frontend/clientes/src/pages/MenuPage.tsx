import React, { useState, useMemo, useEffect } from 'react';
import type { Category, Product } from '../types';
import { Header } from '../components/Header';
import { ProductCard } from '../components/ProductCard';
import { ProductModal } from '../components/ProductModal';
import { CartDrawer } from '../components/CartDrawer';
import { OrderHistoryModal } from '../components/OrderHistoryModal';
import { ProfileModal } from '../components/ProfileModal';
import { OrderConfirmationModal } from '../components/OrderConfirmationModal';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { getCategories, getProducts, type ApiCategory, type ApiProduct } from '../api/catalog';
import { getCategoryIcon } from '../utils/categories';
import { centsToNumber } from '../utils/money';

const DEFAULT_IMAGE =
  'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=600&q=80';

function getProductImage(name: string, imageUrl: string | null): string {
  if (imageUrl) return imageUrl;
  const lower = name.toLowerCase();
  if (lower.includes('frap') || lower.includes('helad') || lower.includes('cold') || lower.includes('iced')) {
    return 'https://images.unsplash.com/photo-1517256064527-09c73fc73e38?auto=format&fit=crop&w=600&q=80';
  }
  if (lower.includes('latte') || lower.includes('capuch') || lower.includes('capp')) {
    return 'https://images.unsplash.com/photo-1534778101976-62847782c213?auto=format&fit=crop&w=600&q=80';
  }
  return DEFAULT_IMAGE;
}

export const MenuPage: React.FC = () => {
  const { currentUser } = useAuth();
  const { selectedCustomizingProduct, setSelectedCustomizingProduct } = useCart();

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Carga inicial del catálogo desde el Backend
  useEffect(() => {
    let isMounted = true;
    async function loadCatalog() {
      setIsLoading(true);
      try {
        const [apiCategories, apiProducts] = await Promise.all([
          getCategories().catch(() => [] as ApiCategory[]),
          getProducts().catch(() => [] as ApiProduct[]),
        ]);

        if (isMounted) {
          if (apiCategories.length > 0) {
            const mappedCategories: Category[] = apiCategories.map((c) => ({
              id: c.id,
              name: c.name,
              icon: getCategoryIcon(c.name),
              count: apiProducts.filter((p) => p.categoryId === c.id).length,
            }));
            setCategories(mappedCategories);
            setActiveCategory((prev) => (mappedCategories.some((c) => c.id === prev) ? prev : mappedCategories[0].id));
          } else {
            const rawCats = localStorage.getItem('coffees_menu_categories_local') || localStorage.getItem('taffy_menu_categories_local');
            if (rawCats) {
              try {
                const parsed = JSON.parse(rawCats);
                if (Array.isArray(parsed) && parsed.length > 0) {
                  const filtered = parsed.filter((c: any) => c.id !== 'all').map((c: any) => ({
                    id: String(c.id),
                    name: c.name,
                    icon: getCategoryIcon(c.name),
                    count: 0,
                  }));
                  setCategories(filtered);
                  if (filtered.length > 0) setActiveCategory(filtered[0].id);
                } else {
                  setCategories([]);
                  setActiveCategory('');
                }
              } catch {
                setCategories([]);
                setActiveCategory('');
              }
            } else {
              setCategories([]);
              setActiveCategory('');
            }
          }

          if (apiProducts.length > 0) {
            const mappedProducts: Product[] = apiProducts.map((p) => ({
              id: p.id,
              name: p.name,
              description: p.description || 'Especialidad de la cafetería preparada con ingredientes selectos.',
              price: centsToNumber(p.basePriceCents),
              basePriceCents: p.basePriceCents,
              category: p.categoryId,
              image: getProductImage(p.name, p.imageUrl),
              isAvailable: p.isAvailable,
              customizable: true,
            }));
            setProducts(mappedProducts);
          } else {
            const rawProds = localStorage.getItem('coffees_menu_products_local') || localStorage.getItem('taffy_menu_products_local');
            if (rawProds) {
              try {
                const parsed = JSON.parse(rawProds);
                if (Array.isArray(parsed) && parsed.length > 0) {
                  const mapped: Product[] = parsed.map((p: any) => ({
                    id: String(p.id),
                    name: p.name,
                    description: p.desc || 'Especialidad de la cafetería preparada con ingredientes selectos.',
                    price: Number(p.price || 0),
                    basePriceCents: String(Math.round(Number(p.price || 0) * 100)),
                    category: String(p.categoryId || p.category || ''),
                    image: p.image || DEFAULT_IMAGE,
                    isAvailable: p.isAvailable !== false,
                    customizable: true,
                  }));
                  setProducts(mapped);
                } else {
                  setProducts([]);
                }
              } catch {
                setProducts([]);
              }
            } else {
              setProducts([]);
            }
          }
        }
      } catch (err) {
        console.warn('Usando catálogo demo local por indisponibilidad de API:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadCatalog();
    return () => {
      isMounted = false;
    };
  }, []);

  // Filtrado de productos por categoría y favoritos
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      if (showOnlyFavorites) {
        return currentUser ? currentUser.favorites.includes(product.id) : product.isFavorite;
      }
      return String(product.category) === String(activeCategory);
    });
  }, [products, activeCategory, showOnlyFavorites, currentUser]);

  const currentCategoryData = categories.find((c) => c.id === activeCategory);

  return (
    <div className="bg-surface font-body-md text-on-surface antialiased select-none w-full min-h-screen flex flex-col pb-28 overflow-x-hidden">
      {/* Top Application Header */}
      <Header
        onToggleFavorites={() => setShowOnlyFavorites((prev) => !prev)}
        showOnlyFavorites={showOnlyFavorites}
      />

      {/* Main Content Area */}
      <main className="w-full flex-1 bg-surface overflow-x-hidden">
        <div className="w-full max-w-[1280px] mx-auto p-4 flex flex-col gap-4">
          <div className="w-full max-w-md mx-auto flex flex-col gap-3">
            {/* Horizontal Categories Scroll Bar */}
            {!showOnlyFavorites && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1 select-none no-scrollbar -mx-2 px-2">
                {categories.map((cat) => {
                  const isActive = activeCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setActiveCategory(cat.id)}
                      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full shrink-0 shadow-sm active:scale-95 transition-all ${
                        isActive
                          ? 'bg-primary-container text-on-primary'
                          : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container'
                      }`}
                    >
                      <span
                        className={`material-symbols-outlined text-[18px] ${
                          isActive ? 'text-secondary-container' : ''
                        }`}
                      >
                        {cat.icon || 'local_cafe'}
                      </span>
                      <span className={`text-[13px] whitespace-nowrap ${isActive ? 'font-bold' : 'font-semibold'}`}>
                        {cat.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Category Title & Counter */}
            <div className="flex items-center justify-between pt-1 px-1">
              <div className="flex flex-col">
                <span className="text-[11px] text-secondary font-bold uppercase tracking-wider">
                  {showOnlyFavorites ? 'Tus Selecciones' : 'Especialidad de la casa'}
                </span>
                <h2 className="text-[20px] font-bold text-primary tracking-tight">
                  {showOnlyFavorites ? 'Tus Favoritos' : currentCategoryData?.name || 'Catálogo'}
                </h2>
              </div>
              <span className="text-[12px] bg-surface-container px-2.5 py-0.5 rounded-full text-on-surface-variant font-medium">
                {filteredProducts.length} {filteredProducts.length === 1 ? 'variedad' : 'variedades'}
              </span>
            </div>

            {/* Products Grid */}
            {isLoading ? (
              <div className="py-16 text-center flex flex-col items-center justify-center gap-2">
                <span className="material-symbols-outlined text-4xl text-primary animate-spin">
                  progress_activity
                </span>
                <p className="text-xs text-outline font-medium">Cargando menú de la cafetería...</p>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="py-16 text-center flex flex-col items-center justify-center gap-2">
                <span className="material-symbols-outlined text-4xl text-outline">local_cafe</span>
                <p className="text-sm font-bold text-primary">No hay productos en esta categoría</p>
                <p className="text-xs text-outline">Pronto agregaremos nuevas especialidades a la carta.</p>
                {showOnlyFavorites && (
                  <button
                    type="button"
                    onClick={() => setShowOnlyFavorites(false)}
                    className="mt-2 px-4 py-2 rounded-full bg-primary-container text-on-primary text-xs font-bold"
                  >
                    Ver todo el menú
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5 pb-6">
                {filteredProducts.map((product: Product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onOpenCustomize={(p) => setSelectedCustomizingProduct(p)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Cart Checkout Drawer & Sticky Bar */}
      <CartDrawer onOrderSuccess={() => setIsConfirmationOpen(true)} />

      {/* Product Customization Modal */}
      <ProductModal
        product={selectedCustomizingProduct}
        onClose={() => setSelectedCustomizingProduct(null)}
      />

      {/* Order History Modal */}
      <OrderHistoryModal />

      {/* Profile & Rewards Modal */}
      <ProfileModal />

      {/* Order Success Ticket Confirmation Modal */}
      <OrderConfirmationModal
        isOpen={isConfirmationOpen}
        onClose={() => setIsConfirmationOpen(false)}
      />
    </div>
  );
};
