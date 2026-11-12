/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  ShoppingBag,
  Plus,
  Minus,
  CheckCircle2,
  Clock,
  Sparkles,
  X,
  Banknote,
  UtensilsCrossed,
  ArrowRight,
  MapPin,
  Volume2,
  QrCode
} from 'lucide-react';
import { ref, push, set } from 'firebase/database';
import { db } from './firebase';


// High-fidelity generated imagery
import superComboImg from './assets/images/super_combo_popcorn_nachos_1794148566116.jpg';
import coupleComboImg from './assets/images/couple_combo_popcorn_coke_1794148566068.jpg';
import snackComboImg from './assets/images/snack_combo_popcorn_roll_1794148566799.jpg';
import nachosImg from './assets/images/cinema_nachos_cheese_1794148566879.jpg';
import friesImg from './assets/images/cinema_fries_peri_peri_1794148566939.jpg';
import coffeeImg from './assets/images/cinema_cold_coffee_1794148619960.jpg';
import brownieImg from './assets/images/cinema_choco_brownie_1794148619868.jpg';

interface MenuItem {
  id: string;
  name: string;
  description: string;
  badge?: string;
  badgeColor?: 'red' | 'amber' | 'emerald';
  image: string;
  category: 'combo' | 'addon';
}

interface CartItem {
  item: MenuItem;
  quantity: number;
}

const MENU_COMBOS: MenuItem[] = [
  {
    id: 'combo-super',
    name: 'Super Combo',
    description: 'Popcorn L, 2x Coke L, Nachos with Warm Cheese Dip',
    badge: 'BEST VALUE',
    badgeColor: 'red',
    image: superComboImg,
    category: 'combo',
  },
  {
    id: 'combo-couple',
    name: 'Couple Combo',
    description: 'Popcorn L & 2x Ice-Cold Coke L (Cinema Special)',
    badge: 'POPULAR',
    badgeColor: 'amber',
    image: coupleComboImg,
    category: 'combo',
  },
  {
    id: 'combo-snack',
    name: 'Snack Combo',
    description: 'Popcorn R, Coke R, Crispy Chicken/Paneer Roll',
    badge: 'SAVE 20%',
    badgeColor: 'emerald',
    image: snackComboImg,
    category: 'combo',
  },
];

const MENU_ADDONS: MenuItem[] = [
  {
    id: 'addon-nachos',
    name: 'Cheese Nachos',
    description: 'Crispy corn tortilla with hot jalapeño cheddar sauce',
    image: nachosImg,
    category: 'addon',
  },
  {
    id: 'addon-coffee',
    name: 'Cold Coffee',
    description: 'Chilled espresso latte with creamy whipped layer',
    image: coffeeImg,
    category: 'addon',
  },
  {
    id: 'addon-fries',
    name: 'Peri Peri Fries',
    description: 'Skin-on golden fries shaken with spicy peri peri dust',
    image: friesImg,
    category: 'addon',
  },
  {
    id: 'addon-brownie',
    name: 'Choco Brownie',
    description: 'Warm dark chocolate fudge slice with walnut crunch',
    image: brownieImg,
    category: 'addon',
  },
];

export default function App() {
  // 1. Dynamic Seat Extraction
  const [seatNumber, setSeatNumber] = useState<string>('Seat F-12');
  const [isSeatEditorOpen, setIsSeatEditorOpen] = useState(false);
  const [tempSeat, setTempSeat] = useState('');

  // Cart State
  const [cart, setCart] = useState<Record<string, CartItem>>({});
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'fonepay' | 'cash'>('fonepay');
  const [orderInstructions, setOrderInstructions] = useState('');

  // Order Ticket & Confirmation State
  const [activeOrder, setActiveOrder] = useState<{
    id: string;
    seat: string;
    items: CartItem[];
    payment: 'fonepay' | 'cash';
    timestamp: string;
    timeRemaining: number;
  } | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Sound synthesis via Web Audio API (Guaranteed zero-lag, works offline)
  const playCanteenChime = () => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      const notes = [
        { freq: 523.25, time: 0 },    // C5
        { freq: 659.25, time: 0.12 }, // E5
        { freq: 783.99, time: 0.24 }, // G5
        { freq: 1046.50, time: 0.38 } // C6
      ];

      notes.forEach(({ freq, time }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + time);

        gain.gain.setValueAtTime(0, ctx.currentTime + time);
        gain.gain.linearRampToValueAtTime(0.22, ctx.currentTime + time + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + time + 0.45);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + time);
        osc.stop(ctx.currentTime + time + 0.5);
      });
    } catch {
      // Audio not permitted or user interaction needed
    }
  };

  // URL Seat Parser
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlSeat = params.get('seat');
      if (urlSeat && urlSeat.trim().length > 0) {
        const clean = urlSeat.trim();
        setSeatNumber(clean.toLowerCase().startsWith('seat') ? clean : `Seat ${clean.toUpperCase()}`);
      } else {
        setSeatNumber('Seat F-12');
      }
    } catch {
      setSeatNumber('Seat F-12');
    }
  }, []);

  // Countdown timer for active order
  useEffect(() => {
    if (!activeOrder || activeOrder.timeRemaining <= 0) return;
    const interval = setInterval(() => {
      setActiveOrder(prev => {
        if (!prev) return null;
        if (prev.timeRemaining <= 1) {
          clearInterval(interval);
          return { ...prev, timeRemaining: 0 };
        }
        return { ...prev, timeRemaining: prev.timeRemaining - 1 };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [activeOrder?.id]);

  // Cart operations
  const addToCart = (item: MenuItem) => {
    setCart(prev => {
      const existing = prev[item.id];
      const count = existing ? existing.quantity + 1 : 1;
      return {
        ...prev,
        [item.id]: { item, quantity: count }
      };
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart(prev => {
      const existing = prev[itemId];
      if (!existing) return prev;
      if (existing.quantity <= 1) {
        const updated = { ...prev };
        delete updated[itemId];
        return updated;
      }
      return {
        ...prev,
        [itemId]: { ...existing, quantity: existing.quantity - 1 }
      };
    });
  };

  const cartItemsList = useMemo(() => Object.values(cart), [cart]);
  const cartTotalItems = useMemo(() => cartItemsList.reduce((acc, c) => acc + c.quantity, 0), [cartItemsList]);

  // Handle Order Submit
  const handleConfirmOrder = async () => {
    if (cartItemsList.length === 0) return;
    playCanteenChime();

    const randomTicketNumber = Math.floor(1000 + Math.random() * 9000);
    const orderId = `EC-${randomTicketNumber}`;

    const newOrder = {
      id: orderId,
      seat: seatNumber,
      items: cartItemsList.map(c => ({
        name: c.item.name,
        quantity: c.quantity
      })),
      payment: paymentMethod,
      timestamp: Date.now(),
      status: 'new',
      instructions: orderInstructions || ''
    };

    try {
      const ordersRef = ref(db, 'orders');
      const newOrderRef = push(ordersRef);
      await set(newOrderRef, newOrder);
      console.log('Order sent to canteen:', orderId);
    } catch (err) {
      console.error('Failed to send order:', err);
    }

    setActiveOrder({
      id: orderId,
      seat: seatNumber,
      items: [...cartItemsList],
      payment: paymentMethod,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timeRemaining: 300,
    });
    setCart({});
    setIsCheckoutOpen(false);
    setShowConfirmation(true);
  };

  // Quick format helper for countdown MM:SS
  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="min-h-screen bg-[#0b0b0e] text-slate-100 flex justify-center selection:bg-[#E50914] selection:text-white">
      {/* Mobile container - optimized for touch while centered on desktop */}
      <div className="w-full max-w-md min-h-screen bg-[#0d0d12] relative flex flex-col pb-28 border-x border-slate-900 shadow-2xl">
        
        {/* TOP STATUS BAR & BRAND HEADER */}
        <header className="sticky top-0 z-40 bg-[#0d0d12]/95 backdrop-blur-md border-b border-slate-800/80 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            
            {/* Brand with Logo & Gole Complex text */}
            <div className="flex items-center gap-2.5">
              <img
                src="/assets/aistudio/file_00000000e3308246981feffaf116deaa_ae312269.png"
                alt="Event cinema logo"
                className="w-10 h-10 rounded-full object-cover border border-slate-700 shadow-md"
                referrerPolicy="no-referrer"
              />
              <div className="flex flex-col">
                <span className="text-sm font-bold tracking-tight text-white leading-none">
                  Event cinema
                </span>
                <span className="text-[10px] text-slate-400 font-medium tracking-tight mt-0.5">
                  ( Gole complex)
                </span>
              </div>
            </div>

            {/* Top Right: Seat Badge + Cart Icon */}
            <div className="flex items-center gap-2">
              {/* Dynamic Seat Badge with Pulsing Live Dot */}
              <button
                type="button"
                onClick={() => {
                  setTempSeat(seatNumber);
                  setIsSeatEditorOpen(true);
                }}
                title="Tap to switch or verify seat"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 hover:border-slate-700 active:scale-95 transition-all text-xs font-medium"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-slate-300 font-semibold tracking-tight text-[11px] truncate max-w-[110px]">
                  Screen 1 • <span className="text-white font-bold">{seatNumber}</span>
                </span>
              </button>

              {/* Cart Button */}
              <button
                type="button"
                onClick={() => {
                  if (cartTotalItems > 0) setIsCheckoutOpen(true);
                }}
                className={`relative p-2 rounded-xl transition-all ${
                  cartTotalItems > 0
                    ? 'bg-[#E50914] text-white shadow-lg shadow-red-900/40 active:scale-90'
                    : 'bg-slate-900/90 text-slate-400 border border-slate-800'
                }`}
                aria-label="View Cart"
              >
                <ShoppingBag className="w-4 h-4" />
                {cartTotalItems > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white text-[#E50914] text-[10px] font-black flex items-center justify-center shadow-md animate-bounce">
                    {cartTotalItems}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Micro Instant Notice */}
          <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-400 bg-slate-950/60 rounded-lg px-2.5 py-1 border border-slate-900">
            <span className="flex items-center gap-1 text-slate-300">
              <Sparkles className="w-3 h-3 text-amber-400" />
              Instant In-Seat Delivery
            </span>
            <span className="text-emerald-400 font-medium">No App Download Needed</span>
          </div>
        </header>

        {/* ACTIVE TICKET BANNER (If customer already ordered) */}
        {activeOrder && !showConfirmation && (
          <div className="mx-4 mt-3 p-3 rounded-2xl bg-gradient-to-r from-red-950/40 via-slate-900 to-slate-950 border border-red-900/40 shadow-lg flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-600/20 text-[#E50914] flex items-center justify-center font-bold">
                <Clock className="w-5 h-5 animate-spin" style={{ animationDuration: '6s' }} />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-white tracking-wide">Ticket {activeOrder.id}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/50 text-red-300 font-semibold">Prep In-Progress</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Runner arrives in ~<span className="text-amber-300 font-bold font-mono">{formatSeconds(activeOrder.timeRemaining)}</span> to {activeOrder.seat}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowConfirmation(true)}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium tracking-tight"
            >
              Ticket
            </button>
          </div>
        )}

        {/* MAIN CONCESSION FEED */}
        <main className="flex-1 px-4 pt-4 space-y-6">

          {/* SECTION 1: COMBOS FOR YOU */}
          <section>
            <div className="mb-3">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#E50914]">
                <span>✦</span>
                <span>COMBOS FOR YOU</span>
                <span>✦</span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Save more with curated cinema combos
              </p>
            </div>

            <div className="space-y-3.5">
              {MENU_COMBOS.map(combo => {
                const inCartCount = cart[combo.id]?.quantity || 0;
                return (
                  <div
                    key={combo.id}
                    className="group bg-[#13131c] rounded-2xl border border-slate-800/80 overflow-hidden hover:border-slate-700 transition-all shadow-lg flex flex-col"
                  >
                    {/* Food Image with Scrim & Badge */}
                    <div className="relative aspect-[16/9] w-full overflow-hidden bg-slate-900">
                      <img
                        src={combo.image}
                        alt={combo.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#13131c] via-black/20 to-transparent" />

                      {/* Combo Badge */}
                      {combo.badge && (
                        <div className="absolute top-2.5 left-2.5">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider shadow-md ${
                              combo.badgeColor === 'red'
                                ? 'bg-[#E50914] text-white shadow-red-950/60'
                                : combo.badgeColor === 'amber'
                                ? 'bg-amber-500 text-slate-950 font-black shadow-amber-950/60'
                                : 'bg-emerald-500 text-slate-950 font-black shadow-emerald-950/60'
                            }`}
                          >
                            {combo.badge}
                          </span>
                        </div>
                      )}

                      {/* Screen 1 Delivery Guarantee Pill */}
                      <div className="absolute bottom-2 left-2.5 flex items-center gap-1 text-[10px] font-medium text-slate-300 bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded-full border border-white/10">
                        <Clock className="w-3 h-3 text-red-400" />
                        <span>Ready in 5 mins</span>
                      </div>
                    </div>

                    {/* Card Content & Action (Prices removed) */}
                    <div className="p-3.5 flex flex-col justify-between flex-1">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-base font-bold text-white tracking-tight leading-snug">
                            {combo.name}
                          </h3>
                        </div>
                        <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                          {combo.description}
                        </p>
                      </div>

                      {/* ADD Stepper */}
                      <div className="flex items-center justify-end pt-3 mt-3 border-t border-slate-800/60">
                        {inCartCount === 0 ? (
                          <button
                            type="button"
                            onClick={() => addToCart(combo)}
                            className="px-4 py-2 bg-[#E50914] hover:bg-[#c70811] active:scale-95 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-red-950/50 flex items-center gap-1.5"
                          >
                            <Plus className="w-3.5 h-3.5 stroke-[3]" />
                            <span>ADD</span>
                          </button>
                        ) : (
                          <div className="flex items-center gap-2 bg-slate-900 border border-slate-700/80 rounded-xl p-0.5 shadow-inner">
                            <button
                              type="button"
                              onClick={() => removeFromCart(combo.id)}
                              className="w-7 h-7 rounded-lg bg-slate-800 text-slate-200 flex items-center justify-center hover:bg-slate-700 active:scale-90 transition-transform"
                              aria-label="Decrease quantity"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="font-mono text-sm font-bold text-white px-1 w-5 text-center">
                              {inCartCount}
                            </span>
                            <button
                              type="button"
                              onClick={() => addToCart(combo)}
                              className="w-7 h-7 rounded-lg bg-[#E50914] text-white flex items-center justify-center hover:bg-[#c70811] active:scale-90 transition-transform shadow"
                              aria-label="Increase quantity"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* SECTION 2: YOU MAY ALSO LIKE (Impulse Add-ons) */}
          <section className="pt-2">
            <div className="mb-3">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-400">
                <span>✦</span>
                <span>YOU MAY ALSO LIKE</span>
                <span>✦</span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Quick bites & refreshments for your movie
              </p>
            </div>

            {/* 2-Column Responsive Grid */}
            <div className="grid grid-cols-2 gap-3">
              {MENU_ADDONS.map(addon => {
                const inCartCount = cart[addon.id]?.quantity || 0;
                return (
                  <div
                    key={addon.id}
                    className="bg-[#13131c] rounded-2xl border border-slate-800/80 overflow-hidden flex flex-col justify-between hover:border-slate-700 transition-all shadow-md group"
                  >
                    {/* Addon Image */}
                    <div className="relative aspect-[4/3] w-full bg-slate-900 overflow-hidden">
                      <img
                        src={addon.image}
                        alt={addon.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#13131c] via-black/20 to-transparent" />
                    </div>

                    <div className="p-3 flex flex-col flex-1 justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-white tracking-tight leading-snug truncate">
                          {addon.name}
                        </h4>
                        <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                          {addon.description}
                        </p>
                      </div>

                      <div className="flex items-center justify-end pt-2.5 mt-2 border-t border-slate-800/60">
                        {inCartCount === 0 ? (
                          <button
                            type="button"
                            onClick={() => addToCart(addon)}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-[#E50914] text-slate-200 hover:text-white font-bold text-[11px] rounded-lg transition-all active:scale-95 flex items-center gap-1 border border-slate-700 hover:border-transparent"
                          >
                            <Plus className="w-3 h-3" />
                            <span>ADD</span>
                          </button>
                        ) : (
                          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-lg p-0.5">
                            <button
                              type="button"
                              onClick={() => removeFromCart(addon.id)}
                              className="w-6 h-6 rounded bg-slate-800 text-slate-300 flex items-center justify-center hover:bg-slate-700 active:scale-90"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="font-mono text-xs font-bold text-white px-0.5">
                              {inCartCount}
                            </span>
                            <button
                              type="button"
                              onClick={() => addToCart(addon)}
                              className="w-6 h-6 rounded bg-[#E50914] text-white flex items-center justify-center hover:bg-red-700 active:scale-90"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* CINEMA BADGES FOOTER */}
          <footer className="pt-4 pb-8 space-y-4">
            <div className="grid grid-cols-3 gap-2 py-3 px-2 bg-slate-950/70 rounded-xl border border-slate-900 text-center">
              <div className="flex flex-col items-center">
                <span className="text-base">🔒</span>
                <span className="text-[10px] font-semibold text-slate-300 mt-1">100% Secure</span>
              </div>
              <div className="flex flex-col items-center border-x border-slate-800/80 px-1">
                <span className="text-base">⏱️</span>
                <span className="text-[10px] font-semibold text-slate-300 mt-1">5-Min Seat Delivery</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-base">🍿</span>
                <span className="text-[10px] font-semibold text-slate-300 mt-1">Freshly Made</span>
              </div>
            </div>

            <div className="text-center space-y-1">
              <p className="text-[11px] text-slate-500">
                Event cinema ( Gole complex) Concession Stand
              </p>
              <p className="text-[10px] text-slate-600">
                Direct seat service for Screen 1. Delivered without disturbing your movie.
              </p>
            </div>
          </footer>
        </main>

        {/* STICKY FLOATING BOTTOM BAR (Appears automatically when items in cart) */}
        {cartTotalItems > 0 && (
          <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center p-3 pointer-events-none">
            <div className="w-full max-w-md pointer-events-auto bg-[#161622]/95 backdrop-blur-xl border border-red-900/50 rounded-2xl p-3 shadow-2xl shadow-black/90 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300">
              
              {/* Cart Summary */}
              <div className="flex items-center gap-3 pl-1">
                <div className="w-10 h-10 rounded-xl bg-[#E50914] text-white flex items-center justify-center font-black shadow-md shadow-red-950/60 relative">
                  <ShoppingBag className="w-5 h-5" />
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-white text-[#E50914] rounded-full text-[10px] flex items-center justify-center font-bold">
                    {cartTotalItems}
                  </span>
                </div>
                <div>
                  <div className="flex items-baseline gap-1.5 font-mono">
                    <span className="text-xs font-bold text-emerald-400">
                      {cartTotalItems} {cartTotalItems === 1 ? 'item' : 'items'} selected
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                    <span>To:</span>
                    <span className="font-bold text-white underline decoration-emerald-500/50">
                      Screen 1, {seatNumber}
                    </span>
                  </p>
                </div>
              </div>

              {/* Proceed CTA */}
              <button
                type="button"
                onClick={() => setIsCheckoutOpen(true)}
                className="px-5 py-3 bg-gradient-to-r from-[#E50914] to-[#c70811] hover:from-[#c70811] hover:to-[#a1070e] active:scale-95 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-red-900/40 flex items-center gap-1.5 shrink-0"
              >
                <span>Proceed</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* CHECKOUT MODAL (Bottom Sheet) */}
        {isCheckoutOpen && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end justify-center p-0 animate-in fade-in duration-200">
            <div
              className="w-full max-w-md bg-[#12121a] rounded-t-3xl border-t border-slate-800 p-5 max-h-[92vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-300 overflow-y-auto"
            >
              {/* Sheet Drag Handle & Close */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#E50914]" />
                  <h3 className="text-base font-bold text-white">Confirm Cinema Order</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCheckoutOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-900 text-slate-400 hover:text-white flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Dynamic Seat Banner */}
              <div className="my-3.5 p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Delivery Destination</span>
                    <p className="text-sm font-bold text-white">
                      Screen 1 • <span className="text-[#E50914]">{seatNumber}</span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setTempSeat(seatNumber);
                    setIsSeatEditorOpen(true);
                  }}
                  className="text-xs text-slate-400 hover:text-slate-200 underline"
                >
                  Change
                </button>
              </div>

              {/* Order Items Breakdown */}
              <div className="space-y-2.5 my-2">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Items in Order</span>
                <div className="space-y-2 divide-y divide-slate-800/60">
                  {cartItemsList.map(({ item, quantity }) => (
                    <div key={item.id} className="pt-2 flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-white truncate">{item.name}</p>
                        <p className="text-[11px] text-slate-400 font-mono">
                          Qty: {quantity}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg p-0.5">
                          <button
                            type="button"
                            onClick={() => removeFromCart(item.id)}
                            className="w-5 h-5 rounded bg-slate-800 text-slate-300 flex items-center justify-center hover:bg-slate-700"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-mono text-xs font-bold text-white px-1">
                            {quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => addToCart(item)}
                            className="w-5 h-5 rounded bg-[#E50914] text-white flex items-center justify-center hover:bg-red-700"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Payment Method Selector */}
              <div className="my-4 space-y-2">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Verification / Payment</span>
                
                {/* Option 1: Fonepay QR */}
                <label
                  onClick={() => setPaymentMethod('fonepay')}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    paymentMethod === 'fonepay'
                      ? 'bg-red-950/30 border-[#E50914] text-white shadow-md'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="payment"
                    value="fonepay"
                    checked={paymentMethod === 'fonepay'}
                    onChange={() => setPaymentMethod('fonepay')}
                    className="mt-0.5 text-[#E50914] focus:ring-0"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white flex items-center gap-1.5">
                        <QrCode className="w-3.5 h-3.5 text-red-400" />
                        Fonepay / Mobile Banking QR
                      </span>
                      <span className="text-[9px] bg-red-900/60 text-red-300 px-1.5 py-0.5 rounded font-bold">
                        RECOMMENDED
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                      Instant scan & pay at seat.
                    </p>
                  </div>
                </label>

                {/* Option 2: Cash on Delivery */}
                <label
                  onClick={() => setPaymentMethod('cash')}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    paymentMethod === 'cash'
                      ? 'bg-red-950/30 border-[#E50914] text-white shadow-md'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="payment"
                    value="cash"
                    checked={paymentMethod === 'cash'}
                    onChange={() => setPaymentMethod('cash')}
                    className="mt-0.5 text-[#E50914] focus:ring-0"
                  />
                  <div className="flex-1">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Banknote className="w-3.5 h-3.5 text-emerald-400" />
                      Pay Cash on Seat Delivery
                    </span>
                    <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                      Pay runner at your seat.
                    </p>
                  </div>
                </label>
              </div>

              {/* Special Note Input */}
              <div className="mb-4">
                <label className="text-[11px] text-slate-400 font-medium block mb-1">
                  Canteen Note (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g., Less ice in coke, extra tissues"
                  value={orderInstructions}
                  onChange={e => setOrderInstructions(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-[#E50914]"
                />
              </div>

              {/* Confirm Button */}
              <div className="pt-3 border-t border-slate-800/80 space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Seat Delivery Charge</span>
                  <span className="text-emerald-400 font-bold">FREE (0.00)</span>
                </div>

                <button
                  type="button"
                  onClick={handleConfirmOrder}
                  className="w-full py-3.5 bg-gradient-to-r from-[#E50914] to-[#B20710] hover:from-[#c70811] hover:to-[#96060c] active:scale-[0.98] text-white font-extrabold text-sm uppercase tracking-wider rounded-xl transition-all shadow-xl shadow-red-950/60 flex items-center justify-center gap-2"
                >
                  <UtensilsCrossed className="w-4 h-4" />
                  <span>Confirm & Send to Canteen</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ORDER CONFIRMATION / DELIVERY TICKET MODAL */}
        {showConfirmation && activeOrder && (
          <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="w-full max-w-sm bg-[#13131d] border border-slate-800 rounded-3xl p-5 shadow-2xl relative text-center">
              
              {/* Close / Dismiss */}
              <button
                type="button"
                onClick={() => setShowConfirmation(false)}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-900 text-slate-400 hover:text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Success Icon */}
              <div className="mx-auto w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-3 shadow-lg shadow-emerald-950/50">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-widest">
                Order Received by Canteen
              </span>
              <h2 className="text-xl font-black text-white mt-0.5">
                Delivering to Your Seat!
              </h2>

              {/* Cinema Ticket Card */}
              <div className="my-4 p-4 rounded-2xl bg-slate-950 border border-dashed border-slate-800 text-left space-y-3 relative overflow-hidden">
                {/* Decorative cutouts */}
                <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-[#13131d]" />
                <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-[#13131d]" />

                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">TICKET ID</span>
                    <p className="font-mono text-sm font-black text-white">{activeOrder.id}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">TARGET SEAT</span>
                    <p className="text-sm font-black text-[#E50914]">Screen 1 • {activeOrder.seat}</p>
                  </div>
                </div>

                {/* Items preview */}
                <div className="space-y-1 text-xs">
                  {activeOrder.items.map(ci => (
                    <div key={ci.item.name} className="flex justify-between text-slate-300">
                      <span>{ci.quantity}x {ci.item.name}</span>
                      <span className="text-slate-400 font-mono">Ordered</span>
                    </div>
                  ))}
                </div>

                {/* Live Delivery Status Stepper */}
                <div className="pt-2.5 border-t border-slate-800/80">
                  <div className="flex items-center justify-between text-[11px] mb-1.5">
                    <span className="text-slate-400">Estimated Delivery:</span>
                    <span className="font-mono text-amber-400 font-extrabold text-xs">
                      {formatSeconds(activeOrder.timeRemaining)} mins
                    </span>
                  </div>
                  <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-amber-500 to-emerald-500 h-full transition-all duration-1000"
                      style={{ width: `${Math.max(10, ((300 - activeOrder.timeRemaining) / 300) * 100)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1.5 text-center">
                    Canteen runner is quietly bringing items to <span className="text-slate-300 font-semibold">{activeOrder.seat}</span>
                  </p>
                </div>
              </div>

              {/* Sound replay button */}
              <div className="flex items-center justify-center gap-2 mb-4">
                <button
                  type="button"
                  onClick={playCanteenChime}
                  className="px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1.5"
                >
                  <Volume2 className="w-3.5 h-3.5 text-red-400" />
                  <span>Replay Canteen Chime</span>
                </button>
              </div>

              {/* Action */}
              <button
                type="button"
                onClick={() => setShowConfirmation(false)}
                className="w-full py-3 bg-[#E50914] hover:bg-[#c70811] text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg"
              >
                Back to Concession Menu
              </button>
            </div>
          </div>
        )}

        {/* SEAT SWITCHER / SIMULATOR DRAWER */}
        {isSeatEditorOpen && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-xs bg-[#14141f] border border-slate-800 rounded-2xl p-4 shadow-2xl">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-[#E50914]" />
                  Select / Change Seat
                </h4>
                <button
                  onClick={() => setIsSeatEditorOpen(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mb-3">
                Typically scanned from the QR on your seat. You can also pick or type below:
              </p>

              {/* Quick Preset Seats */}
              <div className="grid grid-cols-4 gap-1.5 mb-3">
                {['F-12', 'G-08', 'E-04', 'D-11', 'A-01', 'B-06', 'VIP-1', 'VIP-2'].map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setSeatNumber(`Seat ${s}`);
                      setIsSeatEditorOpen(false);
                    }}
                    className={`py-1.5 text-xs font-mono font-bold rounded-lg border transition-all ${
                      seatNumber === `Seat ${s}`
                        ? 'bg-[#E50914] border-red-500 text-white'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>

              {/* Custom Input */}
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Enter seat (e.g. F-12)"
                  value={tempSeat}
                  onChange={e => setTempSeat(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-[#E50914] uppercase font-mono font-bold"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (tempSeat.trim()) {
                      const clean = tempSeat.trim().toUpperCase();
                      setSeatNumber(clean.startsWith('SEAT') ? clean : `Seat ${clean}`);
                    }
                    setIsSeatEditorOpen(false);
                  }}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl"
                >
                  Save Seat
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
