import { AppShell } from "@/components/layout/AppShell";
import { PlanDetail } from "@/components/planner/PlanDetail";

export default function PlanDetailPage({ params }: { params: { id: string } }) {
  return (
    <AppShell>
      <PlanDetail planId={params.id} />
    </AppShell>
  );
}
