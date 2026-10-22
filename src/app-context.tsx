import { createContext, useContext } from 'react';
import type { Category, Customer, Employee, Member, Product, Salesperson, Settings, Supplier } from './lib/types';

export interface Lookups {
  categories: Category[];
  products: Product[];
  customers: Customer[];
  suppliers: Supplier[];
  salespeople: Salesperson[];
  employees: Employee[];
}

export interface AppState extends Lookups {
  member: Member;
  settings: Settings;
  month: string;
  /** Reload master data after it was edited. */
  reload: () => Promise<void>;
  toast: (msg: string) => void;
  isStaff: boolean;
}

export const AppCtx = createContext<AppState | null>(null);

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useApp outside provider');
  return ctx;
}

export const byId = <T extends { id: string }>(list: T[]) => new Map(list.map(x => [x.id, x]));
