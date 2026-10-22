export type Role = 'owner' | 'bookkeeper' | 'sales';

export interface Member { user_id: string; display_name: string; role: Role; salesperson_id: string | null }
export interface Settings {
  id: number; company_name: string; vat_rate: number; sso_rate: number; sso_min: number; sso_max: number; petty_limit: number;
}
export interface Category { id: string; name: string }
export interface Product { id: string; code: string | null; name: string; category_id: string; price: number; cost: number | null; active: boolean }
export interface Customer {
  id: string; code: string | null; name: string; tax_id: string | null; branch: string; credit_days: number | null;
  pay_day: number | null; address: string | null; phone: string | null; note: string | null; active: boolean;
}
export interface Supplier { id: string; name: string; tax_id: string | null; credit_days: number | null; phone: string | null }
export interface Salesperson { id: string; name: string; phone: string | null; commission_rate: number; is_employee: boolean; active: boolean }
export interface Employee {
  id: string; code: string | null; first_name: string; last_name: string; position: string | null; start_date: string | null;
  end_date: string | null; tax_id: string | null; phone: string | null; address: string | null; salary: number; in_sso: boolean;
  bank: string | null; bank_account: string | null;
}
export interface SaleSummary {
  id: string; doc_no: string; doc_date: string; due_date: string; customer_id: string; salesperson_id: string | null;
  has_vat: boolean; credit_days: number; commission_rate: number; note: string | null;
  subtotal: number; vat: number; total: number; received: number; deducted: number; commission: number;
}
export interface SaleItem { id: string; sale_id: string; product_id: string | null; description: string; category_id: string; qty: number; unit_price: number }
export interface Receipt { id: string; sale_id: string; receipt_date: string; amount: number; deduction: number; note: string | null }
export interface Purchase {
  id: string; doc_no: string | null; doc_date: string; supplier_id: string; category_id: string | null; description: string | null;
  amount: number; has_vat: boolean; credit_days: number; due_date: string; paid_date: string | null;
}
export interface Expense { id: string; doc_date: string; category: string; description: string | null; amount: number }
export interface PettyCash { id: string; doc_date: string; kind: 'in' | 'out'; category: string; description: string | null; amount: number }
export interface Payroll {
  id: string; month: string; employee_id: string; salary: number; overtime: number; sso_employee: number; sso_employer: number;
  advance_deduction: number; pay_date: string | null;
}

export const CREDIT_OPTIONS = [0, 30, 45, 60];
export const EXPENSE_CATEGORIES = ['ค่าเช่า', 'ค่าน้ำ-ไฟ', 'ค่าโทรศัพท์/อินเทอร์เน็ต', 'ค่าขนส่ง', 'ค่าน้ำมัน', 'ค่าซ่อมบำรุง', 'ค่าธรรมเนียมธนาคาร', 'ค่าทำบัญชี', 'ค่าโฆษณา', 'อื่น ๆ'];
export const PETTY_CATEGORIES = ['ค่าน้ำมัน', 'ค่าส่งของ', 'เครื่องเขียน', 'ค่ารับรอง', 'ค่าทางด่วน/จอดรถ', 'อื่น ๆ'];
