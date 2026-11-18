import { requireAdminPage } from "@/server/auth/admin";
import { db } from "@/server/db";
import { PageHeader, Card, Table, inputCls, labelCls } from "@/components/admin/ui";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { formatMoney } from "@/core/money";
import { can } from "@/core/rbac";
import { formatDate } from "@/lib/utils";
import { saveExpenseAction, deleteExpenseAction } from "../../_actions/marketing";

export default async function ExpensesPage() {
  const admin = await requireAdminPage("finance.view");
  const [expenses, byCat] = await Promise.all([
    db.expense.findMany({ orderBy: { date: "desc" }, take: 100 }),
    db.expense.groupBy({ by: ["category"], where: { date: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } }, _sum: { amount: true } }),
  ]);
  return (
    <>
      <PageHeader title="Business expenses" description="Rent, salaries, packaging, software… included in net profit." />
      {can(admin, "finance.manage") && (
        <Card title="Add expense">
          <ActionForm action={saveExpenseAction} className="grid gap-2 sm:grid-cols-5">
            <div><label className={labelCls}>Category</label><input name="category" list="exp-cats" required className={inputCls} /><datalist id="exp-cats">{["rent", "salary", "packaging", "software", "utilities", "photography", "other"].map((c) => <option key={c} value={c} />)}</datalist></div>
            <div><label className={labelCls}>Amount ৳</label><input name="amount" type="number" step="0.01" min={0} required className={inputCls} /></div>
            <div><label className={labelCls}>Date</label><input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className={inputCls} /></div>
            <div><label className={labelCls}>Note</label><input name="note" className={inputCls} /></div>
            <div className="flex items-end"><SubmitButton>Add</SubmitButton></div>
          </ActionForm>
        </Card>
      )}
      <Card title="This month by category" className="mt-4"><ul className="flex flex-wrap gap-3 text-sm">{byCat.map((c) => <li key={c.category} className="rounded-lg bg-paper px-3 py-2"><span className="capitalize">{c.category}</span>: <strong>{formatMoney(c._sum.amount ?? 0)}</strong></li>)}{!byCat.length && <li className="text-muted">None yet</li>}</ul></Card>
      <Card padded={false} className="mt-4">
        <Table head={["Date", "Category", "Amount", "Note", ""]} empty={!expenses.length}>
          {expenses.map((e) => <tr key={e.id}><td>{formatDate(e.date)}</td><td className="capitalize">{e.category}</td><td className="tabular-nums">{formatMoney(e.amount)}</td><td className="text-xs text-muted">{e.note}</td><td>{can(admin, "finance.manage") && <ActionForm action={deleteExpenseAction} confirm="Delete expense?"><input type="hidden" name="id" value={e.id} /><SubmitButton variant="ghost" className="text-danger">Delete</SubmitButton></ActionForm>}</td></tr>)}
        </Table>
      </Card>
    </>
  );
}
