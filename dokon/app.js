import { startApp } from '../shared/shell.js';

startApp({
  type: 'dokon', ns: 'dokon', brand: 'BozorPOS',
  title: 'Kassa, ombor va hisobot bir joyda',
  lead: 'Mahsulotni skaner qiling, chek chiqaring, qoldiq o’zi yangilanadi.',
  points: ['Telefon kamerasi yoki USB skaner bilan ishlaydi', 'Har do’kon ma’lumoti alohida bazada saqlanadi', 'Naqd, karta, Click va Payme hisobi'],
  demo: [['ega', 'ega123'], ['menejer', 'menejer123'], ['kassir', 'kassir123'], ['ega2', 'ega123', 'boshqa do’kon'], ['admin', 'admin123']],
  routes: [
    { id: 'dashboard', label: 'Boshqaruv', icon: 'home', roles: ['owner', 'manager'], load: () => import('./pages/dashboard.js') },
    { id: 'pos', label: 'Kassa', icon: 'cart', roles: ['owner', 'manager', 'cashier'], load: () => import('./pages/pos.js') },
    { id: 'products', label: 'Mahsulotlar', icon: 'box', roles: ['owner', 'manager', 'cashier'], load: () => import('./pages/products.js') },
    { id: 'receiving', label: 'Kirim', icon: 'inbox', roles: ['owner', 'manager'], load: () => import('./pages/receiving.js') },
    { id: 'debts', label: 'Qarzlar', icon: 'file', roles: ['owner', 'manager', 'cashier'], load: () => import('./pages/debts.js') },
    { id: 'counts', label: 'Reviziya', icon: 'check', roles: ['owner', 'manager'], load: () => import('./pages/counts.js') },
    { id: 'shift', label: 'Smena', icon: 'bolt', roles: ['owner', 'manager', 'cashier'], load: () => import('../shared/shift.js') },
    { id: 'reports', label: 'Hisobotlar', icon: 'chart', roles: ['owner', 'manager', 'cashier'], load: () => import('../shared/reports.js') },
    { id: 'journal', label: 'Jurnal', icon: 'file', roles: ['owner'], load: () => import('../shared/journal.js') },
    { id: 'stores', label: 'Do’konlar', icon: 'store', roles: ['super'], load: () => import('../shared/stores.js') },
    { id: 'settings', label: 'Sozlamalar', icon: 'gear', roles: ['owner'], load: () => import('../shared/settings.js') },
  ],
});
